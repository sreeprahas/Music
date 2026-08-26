/**
 * lib/youtube/playback.ts
 *
 * Resolves YouTube playback audio streams through the Python sidecar.
 * Maintains in-memory cache with expiration checking.
 */

import { youtubeSidecar } from './sidecar-client';
import type { ResolvedAudio } from './types';
import { YouTubeResolutionError } from '@/lib/spotify/errors';

const memory = new Map<string, ResolvedAudio>();

export async function resolvePlayback(videoId: string, signal?: AbortSignal): Promise<ResolvedAudio> {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new YouTubeResolutionError('Invalid YouTube video ID');
  }

  const cached = memory.get(videoId);
  if (cached && (!cached.expiresAt || cached.expiresAt > Date.now() + 30_000)) {
    return cached;
  }

  const response = await youtubeSidecar.execute<ResolvedAudio>(
    'get_playback',
    { videoId },
    15_000,
    signal,
  );

  if (!response?.streamUrl) {
    throw new YouTubeResolutionError(
      response?.hasCipher
        ? 'Direct audio stream url unavailable for this video (signature cipher required)'
        : 'YouTube playback response did not include a playable stream URL',
    );
  }

  const resolved: ResolvedAudio = {
    videoId,
    streamUrl: response.streamUrl,
    mimeType: response.mimeType || 'audio/mp4',
    bitrate: response.bitrate,
    contentLength: response.contentLength,
    expiresAt: response.expiresAt,
    hasCipher: response.hasCipher,
  };

  memory.set(videoId, resolved);
  return resolved;
}

export function clearPlayback(videoId?: string): void {
  if (videoId) {
    memory.delete(videoId);
  } else {
    memory.clear();
  }
}
