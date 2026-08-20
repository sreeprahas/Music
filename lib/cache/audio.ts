import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function getAudioDir(): string {
  const dir = path.join(getDataDir(), 'mp3');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getAudioPath(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error('Invalid video id');
  return path.join(getAudioDir(), `${videoId}.mp3`);
}

export function getPartialAudioPath(videoId: string): string {
  return `${getAudioPath(videoId)}.part`;
}

function getAudioMimePath(videoId: string): string {
  return `${getAudioPath(videoId)}.mime`;
}

export function getAudioMimeType(videoId: string): string {
  try {
    const mime = fs.readFileSync(getAudioMimePath(videoId), 'utf8').trim();
    return mime || 'audio/mpeg';
  } catch {
    return 'audio/mpeg';
  }
}

export function setAudioMimeType(videoId: string, mimeType: string): void {
  fs.writeFileSync(getAudioMimePath(videoId), mimeType || 'audio/mpeg', 'utf8');
}

export function deleteAudioMimeType(videoId: string): void {
  try { fs.unlinkSync(getAudioMimePath(videoId)); } catch { /* already absent */ }
}

export function isUsableAudio(videoId: string): boolean {
  try {
    const stat = fs.statSync(getAudioPath(videoId));
    return stat.isFile() && stat.size > 8192;
  } catch { return false; }
}

export async function writeAudioStream(videoId: string, body: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<void> {
  const partial = getPartialAudioPath(videoId);
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
    fs.renameSync(partial, getAudioPath(videoId));
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
