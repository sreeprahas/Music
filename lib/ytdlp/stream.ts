/**
 * yt-dlp stream resolution — extract a direct audio URL for a YouTube video.
 *
 * This is the media-resolution layer for *playback*. Spotify provides
 * "what song is this?"; this module answers "where can I play the
 * corresponding media?".
 *
 * Security: yt-dlp is invoked via `execFile` with an argument ARRAY — never
 * shell string interpolation. The `videoId` is validated against the YouTube
 * ID format before any subprocess is spawned.
 *
 * This module consolidates the stream-extraction logic that previously lived
 * inline in `app/api/stream/route.ts`. The route now delegates here so the
 * media-resolution layer is reusable and testable.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { StreamResolutionError } from '../spotify/errors';
import type { ResolvedStream } from './types';

const execFileAsync = promisify(execFile);

/** Shared yt-dlp executable discovery (mirrors lib/downloader.ts). */
export function getYtdlpPath(): string {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) return process.env.YTDLP_PATH;
  const bundled = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(bundled) ? bundled : 'yt-dlp';
}

/** Validate a YouTube video ID (11 chars, base64-url alphabet). */
export function isValidVideoId(videoId: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

/**
 * Resolve a YouTube video ID to a direct audio stream URL via yt-dlp.
 *
 * Throws `StreamResolutionError` on failure. Never retries indefinitely —
 * the caller may apply its own bounded retry policy.
 */
export async function getStreamUrl(videoId: string): Promise<ResolvedStream> {
  if (!isValidVideoId(videoId)) {
    throw new StreamResolutionError(`Invalid YouTube video ID: ${videoId}`);
  }

  try {
    // SECURITY: execFile with argument array — no shell interpolation.
    const { stdout, stderr } = await execFileAsync(
      getYtdlpPath(),
      [
        '--extractor-args', 'youtube:player_client=android,web',
        '-g', '-f', 'ba/bestaudio/b',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 15000 },
    );
    const streamUrl = stdout.trim().split('\n')[0];

    if (!streamUrl || !streamUrl.startsWith('http')) {
      throw new StreamResolutionError(stderr || 'yt-dlp failed to return a direct stream URL');
    }

    return { videoId, streamUrl, source: 'yt-dlp-live-extractor' };
  } catch (err) {
    if (err instanceof StreamResolutionError) throw err;
    throw new StreamResolutionError(
      err instanceof Error ? `Stream extraction failed: ${err.message}` : 'Stream extraction failed',
    );
  }
}
