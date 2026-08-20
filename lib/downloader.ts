import fs from 'fs';
import { getLocalThumbnailPath, ensureDirs, downloadAndCacheThumbnail } from './db';
import { getAudioPath, isUsableAudio, writeAudioStream, getAudioDir, setAudioMimeType, deleteAudioMimeType } from './cache/audio';
import { resolvePlayback } from './youtube/playback';
import { DownloadError } from './spotify/errors';

export function ensureMp3Dir(): void {
  ensureDirs();
  fs.mkdirSync(getAudioDir(), { recursive: true });
}

export const getMp3Path = getAudioPath;
export const isDownloaded = isUsableAudio;

export function deleteTrack(videoId: string): boolean {
  try {
    const p = getAudioPath(videoId);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
    deleteAudioMimeType(videoId);
    return true;
  } catch (err) {
    console.error(`[downloader] Failed to delete track ${videoId}:`, err);
    return false;
  }
}

export function downloadTrack(
  videoId: string,
  title?: string,
  artist?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureMp3Dir();
    void (async () => {
      try {
        ensureMp3Dir();
        if (isDownloaded(videoId)) return resolve();
        const resolved = await resolvePlayback(videoId);
        const response = await fetch(resolved.streamUrl, { signal: AbortSignal.timeout(300_000) });
        if (!response.ok || !response.body) throw new Error(`Audio stream failed (${response.status})`);
        await writeAudioStream(videoId, response.body);
        setAudioMimeType(videoId, resolved.mimeType);
        await downloadAndCacheThumbnail(videoId).catch(() => { /* optional artwork */ });
        if (!isDownloaded(videoId)) throw new Error('Audio cache did not produce a usable file');
        resolve();
      } catch (error) {
        reject(new DownloadError(error instanceof Error ? error.message : 'Audio download failed'));
      }
    })();
  });
}
