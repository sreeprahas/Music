import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';

/**
 * Audio storage locations.
 *
 * There are exactly TWO distinct audio stores and they must never be mixed:
 *
 *  - 'downloads' → songs the user explicitly downloaded (right-click →
 *    "Download song", "Download all"…). Managed by lib/downloader.ts.
 *  - 'cache'     → songs automatically cached after being streamed. Managed by
 *    lib/cache/streamCache.ts.
 *
 * Both stores are keyed by the global YouTube videoId so a song is stored once
 * regardless of which playlist (or search result) it came from.
 */
export type AudioStore = 'downloads' | 'cache';

export const AUDIO_STORES: readonly AudioStore[] = ['downloads', 'cache'];

export function isAudioStore(value: unknown): value is AudioStore {
  return value === 'downloads' || value === 'cache';
}

/** Normalizes a store query/body parameter with a safe default. */
export function resolveAudioStore(value: unknown): AudioStore {
  return isAudioStore(value) ? value : 'downloads';
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function storeDirName(store: AudioStore): string {
  return store === 'cache' ? 'cache' : 'downloads';
}

/**
 * One-time migration: the pre-split layout kept every audio file in `mp3/`.
 * Those files were all explicit downloads (the auto-cache did not exist yet),
 * so move them into the downloads store.
 */
function migrateLegacyMp3Dir(targetDir: string): void {
  try {
    const legacy = path.join(getDataDir(), 'mp3');
    if (!fs.existsSync(legacy)) return;

    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(legacy)) {
      const source = path.join(legacy, entry);
      const target = path.join(targetDir, entry);
      try {
        if (fs.existsSync(source) && !fs.existsSync(target)) {
          fs.renameSync(source, target);
        } else {
          fs.rmSync(source, { force: true });
        }
      } catch { /* keep migrating the remaining files */ }
    }
    try { fs.rmdirSync(legacy); } catch { /* not empty — leave it */ }
  } catch { /* migration is best-effort */ }
}

export function getAudioDir(store: AudioStore = 'downloads'): string {
  const dir = path.join(getDataDir(), storeDirName(store));
  fs.mkdirSync(dir, { recursive: true });
  // Legacy files were explicit downloads, so they only ever migrate into the
  // downloads store — never into the automatic stream cache.
  if (store === 'downloads') migrateLegacyMp3Dir(dir);
  return dir;
}

/** Kept for backwards compatibility with callers expecting the downloads dir. */
export function getDownloadsDir(): string {
  return getAudioDir('downloads');
}

export function getAudioPath(videoId: string, store: AudioStore = 'downloads'): string {
  if (!VIDEO_ID.test(videoId)) throw new Error('Invalid video id');
  return path.join(getAudioDir(store), `${videoId}.mp3`);
}

export function getPartialAudioPath(videoId: string, store: AudioStore = 'downloads'): string {
  return `${getAudioPath(videoId, store)}.part`;
}

function getAudioMimePath(videoId: string, store: AudioStore): string {
  return `${getAudioPath(videoId, store)}.mime`;
}

export function getAudioMimeType(videoId: string, store: AudioStore = 'downloads'): string {
  try {
    const mime = fs.readFileSync(getAudioMimePath(videoId, store), 'utf8').trim();
    return mime || 'audio/mpeg';
  } catch {
    return 'audio/mpeg';
  }
}

export function setAudioMimeType(videoId: string, mimeType: string, store: AudioStore = 'downloads'): void {
  fs.writeFileSync(getAudioMimePath(videoId, store), mimeType || 'audio/mpeg', 'utf8');
}

export function deleteAudioMimeType(videoId: string, store: AudioStore = 'downloads'): void {
  try { fs.unlinkSync(getAudioMimePath(videoId, store)); } catch { /* already absent */ }
}

export function isUsableAudio(videoId: string, store: AudioStore = 'downloads'): boolean {
  try {
    const stat = fs.statSync(getAudioPath(videoId, store));
    return stat.isFile() && stat.size > 8192;
  } catch { return false; }
}

/** Lists every videoId that has a usable audio file in the given store. */
export function listAudioIds(store: AudioStore = 'downloads'): string[] {
  try {
    const dir = getAudioDir(store);
    return fs.readdirSync(dir)
      .map((file) => {
        const match = /^(.+)\.mp3$/.exec(file);
        return match ? match[1] : '';
      })
      .filter((id) => id.length === 11 && isUsableAudio(id, store));
  } catch {
    return [];
  }
}

export function getAudioFileSize(videoId: string, store: AudioStore = 'downloads'): number {
  try {
    return fs.statSync(getAudioPath(videoId, store)).size;
  } catch {
    return 0;
  }
}

export async function writeAudioStream(
  videoId: string,
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  store: AudioStore = 'downloads',
): Promise<void> {
  const partial = getPartialAudioPath(videoId, store);
  const writer = fs.createWriteStream(partial, { flags: 'w' });
  const reader = body.getReader();
  try {
    while (true) {
      if (signal?.aborted) throw new Error('Download cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      if (value) await new Promise<void>((resolve, reject) => writer.write(Buffer.from(value), (err) => err ? reject(err) : resolve()));
    }
    await new Promise<void>((resolve, reject) => writer.end(() => resolve()).on('error', reject));
    if (!isUsableFile(partial)) throw new Error('Downloaded audio is incomplete');
    fs.renameSync(partial, getAudioPath(videoId, store));
  } catch (error) {
    writer.destroy();
    try { fs.unlinkSync(partial); } catch { /* already removed */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function isUsableFile(file: string): boolean {
  try { return fs.statSync(file).size > 8192; } catch { return false; }
}
