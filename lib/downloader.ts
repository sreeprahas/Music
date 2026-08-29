import fs from 'fs';
import path from 'path';
import { ensureDirs } from './db';
import { getAudioPath, isUsableAudio, getAudioDir, deleteAudioMimeType } from './cache/audio';
import { DownloadError } from './spotify/errors';
import { execYtDlp, YtDlpError, YtDlpNotFoundError, YtDlpTimeoutError } from './youtube/ytdlp';

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

// In-memory stream URL cache with TTL (4 hours) for sub-millisecond stream response
const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

function cleanupPartial(outputPath: string): void {
  try {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath, path.extname(outputPath));
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(base) && (f.endsWith('.part') || f.endsWith('.ytdl') || f.endsWith('.mp4') || f.endsWith('.webm'))) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch { /* ignore cleanup errors */ }
}

function cleanupDownloadedThumbnails(outputPath: string): void {
  try {
    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath, path.extname(outputPath));
    const candidates = [
      path.join(dir, `${base}.webp`),
      path.join(dir, `${base}.jpg`),
      path.join(dir, `${base}.png`),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        fs.unlinkSync(cand);
      }
    }
  } catch { /* ignore */ }
}

/**
 * Downloads a single track as MP3 using yt-dlp.
 * Uses direct video URL first; falls back to search query if direct URL is restricted.
 */
export async function downloadTrack(
  videoId: string,
  title?: string,
  artist?: string,
  signal?: AbortSignal,
): Promise<void> {
  ensureMp3Dir();
  if (isUsableAudio(videoId)) return;

  const outputPath = getAudioPath(videoId);

  // Attempt 1: Direct YouTube download with player_client=android,web
  try {
    await execYtDlp({
      args: [
        '--extractor-args', 'youtube:player_client=android,web',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--write-thumbnail',
        '--convert-thumbnails', 'webp',
        '-o', outputPath,
        '--no-playlist',
        '--no-warnings',
        '--no-part',
        '--no-mtime',
        '--retries', '2',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      signal,
      timeoutMs: 300_000,
    });

    cleanupDownloadedThumbnails(outputPath);

    if (isUsableAudio(videoId)) {
      return;
    }
  } catch (err) {
    if (signal?.aborted) throw new Error('Download cancelled');
    if (err instanceof YtDlpNotFoundError) {
      throw new DownloadError('yt-dlp executable not found');
    }
    console.warn(`[downloader] Direct download failed for ${videoId}, trying fallback search...`);
    cleanupPartial(outputPath);
  }

  // Attempt 2: Fallback search if direct track failed
  const query = [artist, title, 'audio'].filter(Boolean).join(' ');
  if (!query || query.trim() === 'audio') {
    throw new DownloadError(`Failed to download track ${videoId}`);
  }

  try {
    await execYtDlp({
      args: [
        '--extractor-args', 'youtube:player_client=android,web',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--write-thumbnail',
        '--convert-thumbnails', 'webp',
        '-o', outputPath,
        '--no-playlist',
        '--no-warnings',
        '--no-part',
        '--no-mtime',
        '--retries', '2',
        `ytsearch1:${query.replace(/"/g, '')}`,
      ],
      signal,
      timeoutMs: 300_000,
    });

    cleanupDownloadedThumbnails(outputPath);

    if (isUsableAudio(videoId)) {
      return;
    }
  } catch (err) {
    cleanupPartial(outputPath);
    if (signal?.aborted) throw new Error('Download cancelled');
    const msg = err instanceof YtDlpError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Download error';
    throw new DownloadError(`Failed to download "${title || videoId}": ${msg}`);
  }

  throw new DownloadError(`Failed to download audio for "${title || videoId}"`);
}

/**
 * Gets a direct playable audio stream URL for a video via yt-dlp.
 * Cached in memory for sub-millisecond retrieval.
 * Tries android player_client first; falls back to android,web if that
 * produces no usable URL (improves reliability for age-gated / restricted
 * videos while keeping the fast path for normal tracks).
 */
export async function getStreamUrl(videoId: string, signal?: AbortSignal): Promise<string> {
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Attempt 1: android client (fastest, no throttling)
  let url = '';
  try {
    const result = await execYtDlp({
      args: [
        '--extractor-args', 'youtube:player_client=android',
        '-g',
        '-f', 'ba/b',
        '--no-playlist',
        '--no-warnings',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      signal,
      timeoutMs: 15_000,
    });
    const lines = result.stdout.trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    url = lines[0] || '';
  } catch {
    // First attempt failed — try fallback below.
  }

  // Attempt 2: android + web fallback (handles restricted / age-gated)
  if (!url) {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const result = await execYtDlp({
      args: [
        '--extractor-args', 'youtube:player_client=android,web',
        '-g',
        '-f', 'ba/b',
        '--no-playlist',
        '--no-warnings',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      signal,
      timeoutMs: 15_000,
    });
    const lines = result.stdout.trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    url = lines[0] || '';
  }

  if (!url) {
    throw new DownloadError('Could not extract direct stream URL');
  }

  // Cache for 5 hours (YouTube stream URLs expire after ~6 hours).
  // The extra hour of headroom prevents stale cache hits near expiry.
  streamUrlCache.set(videoId, {
    url,
    expiresAt: Date.now() + 5 * 60 * 60 * 1000,
  });

  return url;
}
