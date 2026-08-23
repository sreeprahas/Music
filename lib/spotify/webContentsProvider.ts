/**
 * Server-side client for the Electron main-process hidden WebContents provider.
 * Transport: correlated requests, streamed progress, and explicit cancellation.
 */

import { extractPlaylistId } from './validation';

export interface SpotifyScrapeProgress {
  type: 'navigating' | 'started' | 'progress';
  fetched: number;
  total: number;
}

export interface ScrapedSpotifyPlaylist {
  id: string;
  name: string;
  image: string;
}

export interface ScrapedSpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  image?: string;
  addedAt?: string;
}

export interface SpotifyScrapeResult {
  playlist: ScrapedSpotifyPlaylist;
  tracks: ScrapedSpotifyTrack[];
  diagnostics: {
    expectedTotal: number;
    collected: number;
    elapsedMs: number;
  };
}

/** Adapt the isolated Electron payload to the app's existing Spotify raw model. */
export function toNormalizedSpotifyTrack(track: ScrapedSpotifyTrack): {
  name: string;
  artists: string;
  duration_ms: number;
  image: string;
  added_at: string;
  spotifyTrackId: string;
  album?: string;
} {
  return {
    name: track.title,
    artists: track.artist,
    duration_ms: track.durationMs || 0,
    image: track.image || '',
    added_at: track.addedAt || new Date().toISOString(),
    spotifyTrackId: track.id,
    album: track.album,
  };
}

interface ProviderBridge {
  request(
    input: string,
    onProgress: (progress: SpotifyScrapeProgress) => void,
  ): { promise: Promise<SpotifyScrapeResult>; cancel(): void };
  cancel(requestId: number): void;
}

type BridgeHost = typeof globalThis & {
  __musicSpotifyWebContentsProvider?: ProviderBridge;
};

export async function fetchPlaylistWithHiddenWebContents(
  rawInput: string,
  options: {
    onProgress?: (fetched: number, total: number) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<{ playlist: ScrapedSpotifyPlaylist; tracks: ScrapedSpotifyTrack[] }> {
  const playlistId = extractPlaylistId(rawInput);
  if (!playlistId) throw new Error('A valid public Spotify playlist URL is required.');

  const host = globalThis as BridgeHost;
  const bridge = host.__musicSpotifyWebContentsProvider;
  if (!bridge) {
    throw new Error('The hidden Spotify renderer is available only inside the desktop app.');
  }

  const timeoutMs = options.timeoutMs ?? 180_000;
  let handle: { promise: Promise<SpotifyScrapeResult>; cancel(): void } | undefined;
  let timeoutTimer: NodeJS.Timeout | undefined;

  const onAbort = () => {
    if (handle) handle.cancel();
  };
  if (options.signal?.aborted) throw new Error('Spotify import was canceled.');

  console.log(`[SpotifyImport] provider request started for playlist: ${playlistId}`);
  try {
    handle = bridge.request(rawInput, (progress) => {
      options.onProgress?.(progress.fetched, progress.total);
    });
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        handle?.cancel();
        reject(new Error(`Spotify playlist retrieval timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
    });

    const result = await Promise.race([handle.promise, timeoutPromise]);
    if (result.playlist.id !== playlistId) {
      throw new Error('Spotify returned data for the wrong playlist.');
    }
    console.log(`[SpotifyImport] provider received ${result.tracks.length} tracks for ${playlistId}`);
    return result;
  } finally {
    clearTimeout(timeoutTimer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
