import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';
import {
  getAudioDir,
  getAudioPath,
  getPartialAudioPath,
  getAudioFileSize,
  isUsableAudio,
  setAudioMimeType,
  type AudioStore,
} from './audio';

/**
 * Automatic stream cache.
 *
 * While a song is being streamed through /api/stream/live, the audio bytes are
 * teed to disk. Once the full file has been received the partial file is
 * promoted to the cache store and future playbacks are served straight from
 * disk — no further network access.
 *
 * This is a REAL audio cache: the actual playable bytes are persisted, never
 * just metadata. The small cache-meta.json only adds display metadata
 * (title/artist) for the "Cached Songs" view and is written in addition to the
 * audio, never instead of it.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface CachedTrackMeta {
  videoId: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  cachedAt: number;
}

interface CacheWriteHandle {
  writer: fs.WriteStream;
  videoId: string;
  bytes: number;
  aborted: boolean;
}

/** Only one writer per videoId at a time — duplicates share the first stream. */
const activeWrites = new Map<string, CacheWriteHandle>();

function metaPath(): string {
  return path.join(getDataDir(), 'cache-meta.json');
}

export function isCached(videoId: string): boolean {
  return isUsableAudio(videoId, 'cache');
}

export function getCachedAudioPath(videoId: string): string {
  return getAudioPath(videoId, 'cache');
}

export function getCachedFileSize(videoId: string): number {
  return getAudioFileSize(videoId, 'cache');
}

export function deleteCachedAudio(videoId: string): boolean {
  try {
    const p = getAudioPath(videoId, 'cache');
    if (fs.existsSync(p)) fs.unlinkSync(p);
    try { fs.unlinkSync(`${p}.mime`); } catch { /* already absent */ }
    deleteCachedTrackMeta(videoId);
    return true;
  } catch {
    return false;
  }
}

/** Reads the display metadata for every cached song (best effort). */
export function readCacheMeta(): Record<string, CachedTrackMeta> {
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath(), 'utf8')) as Record<string, CachedTrackMeta>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCacheMeta(meta: Record<string, CachedTrackMeta>): void {
  const file = metaPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.part`;
  fs.writeFileSync(temp, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

export function saveCachedTrackMeta(entry: Omit<CachedTrackMeta, 'cachedAt'>): void {
  try {
    const meta = readCacheMeta();
    if (!VIDEO_ID.test(entry.videoId)) return;
    meta[entry.videoId] = { ...entry, cachedAt: Date.now() };
    // Keep the metadata bounded; oldest entries drop first.
    const entries = Object.entries(meta);
    if (entries.length > 2048) {
      entries.sort(([, a], [, b]) => a.cachedAt - b.cachedAt);
      for (const [oldKey] of entries.slice(0, entries.length - 2048)) delete meta[oldKey];
    }
    writeCacheMeta(meta);
  } catch { /* metadata is best-effort — audio is the source of truth */ }
}

export function deleteCachedTrackMeta(videoId: string): void {
  try {
    const meta = readCacheMeta();
    if (!(videoId in meta)) return;
    delete meta[videoId];
    writeCacheMeta(meta);
  } catch { /* best effort */ }
}

export function getCachedTrackMeta(videoId: string): CachedTrackMeta | undefined {
  return readCacheMeta()[videoId];
}

/**
 * Opens (or joins) the cache write for a videoId.
 *
 * Returns null when the song is already fully cached — callers can stop
 * caching. Returns a handle otherwise; every received chunk must be passed to
 * writeCacheChunk() and the stream end must call completeCacheWrite() (or
 * abortCacheWrite() on errors/cancellation).
 */
export function beginCacheWrite(
  videoId: string,
  mimeType: string,
  meta?: { title?: string; artist?: string; thumbnailUrl?: string },
): CacheWriteHandle | null {
  if (!VIDEO_ID.test(videoId)) return null;
  // Already cached (or currently being written by another playback) → nothing to do.
  if (isCached(videoId)) {
    console.log(`[streamCache] beginCacheWrite ${videoId}: already cached, skipping`);
    return null;
  }
  console.log(`[streamCache] beginCacheWrite ${videoId}: starting cache write`);

  const existing = activeWrites.get(videoId);
  if (existing) return existing;

  getAudioDir('cache');
  const partial = getPartialAudioPath(videoId, 'cache');
  try {
    fs.rmSync(partial, { force: true });
    const writer = fs.createWriteStream(partial, { flags: 'w' });
    const handle = {
      writer,
      videoId,
      bytes: 0,
      aborted: false,
      mimeType: mimeType || 'audio/mpeg',
      meta,
    } as CacheWriteHandle & { mimeType: string; meta: typeof meta };
    activeWrites.set(videoId, handle);
    writer.on('error', () => {
      handle.aborted = true;
      activeWrites.delete(videoId);
    });
    return handle;
  } catch {
    return null;
  }
}

export function writeCacheChunk(handle: CacheWriteHandle, chunk: Uint8Array): void {
  if (handle.aborted) return;
  handle.bytes += chunk.byteLength;
  handle.writer.write(Buffer.from(chunk));
  // Log first chunk and every ~1MB to track progress without flooding
  if (handle.bytes === chunk.byteLength) {
    console.log(`[streamCache] writeCacheChunk ${handle.videoId}: first chunk ${chunk.byteLength}B`);
  } else if (handle.bytes % (1024 * 1024) < chunk.byteLength) {
    console.log(`[streamCache] writeCacheChunk ${handle.videoId}: ${(handle.bytes / 1024 / 1024).toFixed(1)}MB written`);
  }
}

/**
 * Promotes the partial file to a real cached song once the whole file has been
 * received (no Range requests, full upstream stream ended cleanly).
 */
export function completeCacheWrite(handle: CacheWriteHandle): void {
  if (activeWrites.get(handle.videoId) !== handle) return;
  activeWrites.delete(handle.videoId);
  console.log(`[streamCache] completeCacheWrite ${handle.videoId}: promoting partial to cache`);

  const partial = getPartialAudioPath(handle.videoId, 'cache');
  try {
    handle.writer.end(() => {
      try {
        if (handle.aborted) return;
        if (!fs.existsSync(partial) || fs.statSync(partial).size <= 8192) {
          fs.rmSync(partial, { force: true });
          return;
        }
        fs.renameSync(partial, getAudioPath(handle.videoId, 'cache'));
        const info = handle as CacheWriteHandle & { mimeType?: string; meta?: { title?: string; artist?: string; thumbnailUrl?: string } };
        setAudioMimeType(handle.videoId, info.mimeType || 'audio/mpeg', 'cache');
        saveCachedTrackMeta({
          videoId: handle.videoId,
          title: info.meta?.title,
          artist: info.meta?.artist,
          thumbnailUrl: info.meta?.thumbnailUrl,
        });
      } catch { /* a later run cleans up stale partials */ }
    });
  } catch { /* best effort */ }
}

/** Discards the partial file after an error / cancellation. */
export function abortCacheWrite(handle: CacheWriteHandle): void {
  if (activeWrites.get(handle.videoId) !== handle) return;
  activeWrites.delete(handle.videoId);
  handle.aborted = true;
  try {
    handle.writer.destroy();
    fs.rmSync(getPartialAudioPath(handle.videoId, 'cache'), { force: true });
  } catch { /* best effort */ }
}

/**
 * Cache playback priority helper used by the stream endpoints.
 *
 * 1. Explicitly downloaded song (downloads store)
 * 2. Automatically cached song (cache store)
 * 3. Otherwise → network
 */
export function resolveLocalAudioStore(videoId: string): AudioStore | null {
  const isDl = isUsableAudio(videoId, 'downloads');
  const isCache = isUsableAudio(videoId, 'cache');
  console.log(`[streamCache] resolveLocalAudioStore ${videoId}: downloads=${isDl} cache=${isCache}`);
  if (isDl) return 'downloads';
  if (isCache) return 'cache';
  return null;
}