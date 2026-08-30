import { NextResponse } from 'next/server';
import { getLocalPlaylists, getCachedTracks } from '@/lib/db';
import { listAudioIds } from '@/lib/cache/audio';
import { readCacheMeta, isCached, deleteCachedAudio } from '@/lib/cache/streamCache';
import type { Track } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cached-songs
 *
 * Lists every song in the automatic stream cache. The cache is GLOBAL —
 * songs are keyed by their YouTube videoId regardless of which playlist or
 * search result they came from, so each song appears exactly once.
 *
 * Prunes stale entries whose audio file went missing before listing.
 *
 * Response: { songs: Array<Track & { cachedAt?: number }>, count }
 */
export async function GET() {
  try {
    const cachedIds = listAudioIds('cache');
    const meta = readCacheMeta();

    // Global song metadata lookup across all playlists (playlist membership is
    // a separate concept; the songs themselves are global).
    const known = new Map<string, Partial<Track>>();
    for (const playlist of getLocalPlaylists()) {
      for (const track of getCachedTracks(playlist.id) || []) {
        if (track.videoId && !known.has(track.videoId)) {
          known.set(track.videoId, track);
        }
      }
    }

    const songs: Array<Track & { cachedAt?: number }> = [];
    for (const videoId of cachedIds) {
      // Stale cache entry (audio file vanished) → drop it from the metadata.
      if (!isCached(videoId)) {
        deleteCachedAudio(videoId);
        continue;
      }
      const info = known.get(videoId);
      const cachedMeta = meta[videoId];
      const song: Track & { cachedAt?: number } = {
        videoId,
        title: info?.title || cachedMeta?.title || videoId,
        artist: info?.artist || cachedMeta?.artist || 'Unknown Artist',
        album: info?.album,
        thumbnailUrl: info?.thumbnailUrl || cachedMeta?.thumbnailUrl || '',
        duration: info?.duration,
        position: info?.position ?? 0,
        dateAdded: cachedMeta ? new Date(cachedMeta.cachedAt).toISOString() : undefined,
        sourceTrackId: info?.sourceTrackId,
        source: info?.source,
        cachedAt: cachedMeta?.cachedAt,
      };
      songs.push(song);
    }

    songs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return NextResponse.json({ songs, count: songs.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list cached songs', songs: [] },
      { status: 500 },
    );
  }
}