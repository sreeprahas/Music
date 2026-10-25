// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { ensureDirs } from './db';
import { log, logWarn, logError } from './log';
import {
  getAudioPath,
  isUsableAudio,
  getAudioDir,
  deleteAudioMimeType,
  writeAudioStream,
  setAudioMimeType,
  type AudioStore,
} from './cache/audio';
import { DownloadError } from './spotify/errors';
import {
  execYtDlp,
  YtDlpError,
  YtDlpNotFoundError,
} from './youtube/ytdlp';
import { resolvePlayableStream } from './youtube/resolver';

/**
 * The downloader writes ONLY into the downloads store â€” songs the user
 * explicitly asked to keep offline. Automatically cached songs live in a
 * separate directory managed by lib/cache/streamCache.ts.
 */
const DOWNLOAD_STORE: AudioStore = 'downloads';

export function ensureMp3Dir(): void {
  ensureDirs();
  fs.mkdirSync(getAudioDir(DOWNLOAD_STORE), { recursive: true });
}

/** Legacy alias â€” always points at the downloads store. */
export function getMp3Path(videoId: string): string {
  return getAudioPath(videoId, DOWNLOAD_STORE);
}

/** True when the song exists as an explicit user download. */
export function isDownloaded(videoId: string): boolean {
  return isUsableAudio(videoId, DOWNLOAD_STORE);
}

export function deleteTrack(videoId: string): boolean {
  try {
    const p = getAudioPath(videoId, DOWNLOAD_STORE);

    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }

    deleteAudioMimeType(videoId, DOWNLOAD_STORE);
    return true;
  } catch (err) {
    logError('[downloader] Failed to delete track ' + videoId + ': ' + err);
    return false;
  }
}

/**
 * Direct InnerTube stream cache.
 *
 * We cache the resolved URL plus the mime type / bitrate so the streaming
 * route can forward accurate Content-Type / Content-Length headers without
 * re-resolving. YouTube stream URLs are temporary and must not be treated
 * as permanent.
 *
 * Keyed by the YouTube videoId. When the user changes a song's YouTube
 * override, clearStreamUrlCache() drops every entry — the new videoId is
 * resolved fresh on the next play.
 */
const streamUrlCache = new Map<
  string,
  {
    url: string;
    mimeType: string;
    bitrate: number;
    expiresAt: number;
  }
>();

/**
 * Clears the in-memory stream URL cache. Call this when a YouTube override
 * has been saved so the next playback fetches a fresh stream URL for the
 * new videoId instead of reusing a stale cached URL.
 */
export function clearStreamUrlCache(): void {
  streamUrlCache.clear();
}

/**
 * Prevent duplicate simultaneous InnerTube resolution for the same video.
 *
 * Without this, the player and prefetch endpoint can both resolve the same
 * video at the same time.
 */
const streamResolutionInFlight = new Map<
  string,
  Promise<string>
>();

function cleanupPartial(outputPath: string): void {
  try {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath, path.extname(outputPath));

    for (const f of fs.readdirSync(dir)) {
      if (
        f.startsWith(base) &&
        (
          f.endsWith('.part') ||
          f.endsWith('.ytdl') ||
          f.endsWith('.mp4') ||
          f.endsWith('.webm')
        )
      ) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {
    // Ignore cleanup errors.
  }
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
  } catch {
    // Ignore cleanup errors.
  }
}

/**
 * Downloads a single track into the local audio cache.
 *
 * PRIMARY PATH â€” the exact same pipeline used for playback:
 *   getStreamUrl() â†’ fetch() â†’ writeAudioStream()
 * This skips yt-dlp's slow ffmpeg post-processing entirely and guarantees
 * that anything the app can stream, it can also cache offline.
 *
 * yt-dlp remains only as a fallback when the direct stream download fails.
 */
export async function downloadTrack(
  videoId: string,
  title?: string,
  artist?: string,
  signal?: AbortSignal,
): Promise<void> {
  ensureMp3Dir();

  if (isUsableAudio(videoId, DOWNLOAD_STORE)) {
    return;
  }

  // â”€â”€ Primary: stream pipeline (identical to playback) â”€â”€
  try {
    const streamUrl = await getStreamUrl(videoId, signal);
    const res = await fetch(streamUrl, { signal });

    if (res.ok && res.body) {
      const rawMime = (res.headers.get('content-type') || '').split(';')[0].trim();
      await writeAudioStream(videoId, res.body, signal, DOWNLOAD_STORE);
      setAudioMimeType(videoId, rawMime || 'audio/mpeg', DOWNLOAD_STORE);

      if (isUsableAudio(videoId, DOWNLOAD_STORE)) {
        return;
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      throw new Error('Download cancelled');
    }

    // The resolved URL may have expired mid-flight â€” drop it so the next
    // attempt re-resolves a fresh stream URL.
    invalidateStreamUrl(videoId);

    console.warn(
      `[downloader] Stream download failed for ${videoId}, falling back to yt-dlp:`,
      err instanceof Error ? err.message : err,
    );
  }

  // â”€â”€ Fallback: yt-dlp extraction + transcode â”€â”€
  const outputPath = getAudioPath(videoId, DOWNLOAD_STORE);

  try {
    await execYtDlp({
      args: [
        '--extractor-args',
        'youtube:player_client=android,web',
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '--write-thumbnail',
        '--convert-thumbnails',
        'webp',
        '-o',
        outputPath,
        '--no-playlist',
        '--no-warnings',
        '--no-part',
        '--no-mtime',
        '--retries',
        '2',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      signal,
      timeoutMs: 300_000,
    });

    cleanupDownloadedThumbnails(outputPath);

    if (isUsableAudio(videoId, DOWNLOAD_STORE)) {
      return;
    }
  } catch (err) {
    if (signal?.aborted) {
      throw new Error('Download cancelled');
    }

    if (err instanceof YtDlpNotFoundError) {
      throw new DownloadError('yt-dlp executable not found');
    }

    console.warn(
      `[downloader] Direct download failed for ${videoId}, trying fallback search...`,
    );

    cleanupPartial(outputPath);
  }

  const query = [artist, title, 'audio']
    .filter(Boolean)
    .join(' ');

  if (!query || query.trim() === 'audio') {
    throw new DownloadError(`Failed to download track ${videoId}`);
  }

  try {
    await execYtDlp({
      args: [
        '--extractor-args',
        'youtube:player_client=android,web',
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '--write-thumbnail',
        '--convert-thumbnails',
        'webp',
        '-o',
        outputPath,
        '--no-playlist',
        '--no-warnings',
        '--no-part',
        '--no-mtime',
        '--retries',
        '2',
        `ytsearch1:${query.replace(/"/g, '')}`,
      ],
      signal,
      timeoutMs: 300_000,
    });

    cleanupDownloadedThumbnails(outputPath);

    if (isUsableAudio(videoId, DOWNLOAD_STORE)) {
      return;
    }
  } catch (err) {
    cleanupPartial(outputPath);

    if (signal?.aborted) {
      throw new Error('Download cancelled');
    }

    const msg =
      err instanceof YtDlpError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Download error';

    throw new DownloadError(
      `Failed to download "${title || videoId}": ${msg}`,
    );
  }

  throw new DownloadError(
    `Failed to download audio for "${title || videoId}"`,
  );
}

/**
 * Removes an expired stream URL from the cache.
 */
export function invalidateStreamUrl(videoId: string): void {
  streamUrlCache.delete(videoId);
}

/**
 * Returns true when a non-expired direct stream URL is already cached.
 */
export function hasCachedStreamUrl(videoId: string): boolean {
  const cached = streamUrlCache.get(videoId);

  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    streamUrlCache.delete(videoId);
    return false;
  }

  return true;
}

/**
 * Resolves a direct audio stream URL.
 *
 * FAST PATH:
 *   in-memory stream URL cache
 *
 * RESOLUTION:
 *   yt-dlp direct URL extraction
 *
 * Duplicate requests for the same video share one in-flight promise.
 */
export async function getStreamUrl(
  videoId: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new DownloadError('Invalid YouTube video ID');
  }

  const cached = streamUrlCache.get(videoId);

  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.url;
    }

    streamUrlCache.delete(videoId);
  }

  const existingResolution = streamResolutionInFlight.get(videoId);

  if (existingResolution) {
    return existingResolution;
  }

  const resolution = resolveStreamUrl(videoId, signal);

  streamResolutionInFlight.set(videoId, resolution);

  try {
    return await resolution;
  } finally {
    streamResolutionInFlight.delete(videoId);
  }
}

async function resolveStreamUrl(
  videoId: string,
  signal?: AbortSignal,
): Promise<string> {
  const t0 = Date.now();
  log('[downloader] stream resolve start videoId=' + videoId);

  try {
    const playable = await resolvePlayableStream(videoId, signal) as any;
    streamUrlCache.set(videoId, {
      url: playable.url,
      mimeType: playable.mimeType || 'audio/webm',
      bitrate: playable.bitrate || 0,
      expiresAt: playable.expiresAt || (Date.now() + 15 * 60 * 1000),
    });
    log('[downloader] stream resolve ok videoId=' + videoId + ' source=' + playable.source + ' duration=' + (Date.now() - t0) + 'ms mime=' + (playable.mimeType || '?') + ' bitrate=' + (playable.bitrate || 0));
    return playable.url;
  } catch (err) {
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    logWarn('[downloader] stream resolve failed videoId=' + videoId + ' duration=' + (Date.now() - t0) + 'ms: ' + (err instanceof Error ? err.message : err));

    throw new DownloadError(
      'Could not resolve a playable audio stream',
    );
  }
}
