/**
 * POST /api/spotify/prefetch
 *
 * Resolves a small window of Spotify tracks in the background. Existing
 * Spotify -> YouTube mappings and stream-cache entries are reused.
 */
import { NextResponse } from 'next/server';
import { matchSpotifyTrack } from '@/lib/matching/matcher';
import { getStreamUrl, hasCachedStreamUrl } from '@/lib/downloader';
import { isUsableAudio } from '@/lib/cache/audio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PrefetchTrack {
  title?: unknown;
  artist?: unknown;
  duration?: unknown;
  spotifyId?: unknown;
  album?: unknown;
  thumbnailUrl?: unknown;
  videoId?: unknown;
  downloaded?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tracks?: unknown };
    const input = Array.isArray(body.tracks) ? body.tracks.slice(0, 4) as PrefetchTrack[] : [];

    if (!input.length) {
      return NextResponse.json({ results: [] });
    }

    const results = await Promise.all(input.map(async (track) => {
      const title = typeof track.title === 'string' ? track.title.trim() : '';
      const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
      const spotifyId = typeof track.spotifyId === 'string' ? track.spotifyId.trim() : '';
      const existingVideoId = typeof track.videoId === 'string' ? track.videoId.trim() : '';
      const duration = typeof track.duration === 'number' ? track.duration : undefined;
      const album = typeof track.album === 'string' ? track.album.trim() : undefined;
      const thumbnailUrl = typeof track.thumbnailUrl === 'string' ? track.thumbnailUrl.trim() : undefined;

      if (track.downloaded && existingVideoId) {
        return { spotifyId, videoId: existingVideoId, status: 'local' };
      }

      let videoId = existingVideoId;

      if (!videoId && title && spotifyId) {
        try {
          const match = await matchSpotifyTrack(
            { id: spotifyId, title, artist, duration, album, thumbnailUrl },
            {},
          );
          videoId = match.candidate?.videoId || '';
        } catch {
          return { spotifyId, videoId: '', status: 'match_failed' };
        }
      }

      if (!videoId) {
        return { spotifyId, videoId: '', status: 'unresolved' };
      }

      if (isUsableAudio(videoId)) {
        return { spotifyId, videoId, status: 'local' };
      }

      // Warm the stream without tying the process to this HTTP request.
      // The route can return immediately while yt-dlp resolves in the
      // background, and duplicate playback requests share the same promise.
      void getStreamUrl(videoId).catch((error) => {
        console.warn(
          `[spotify/prefetch] stream warm failed for ${videoId}:`,
          error instanceof Error ? error.message : error,
        );
      });

      return {
        spotifyId,
        videoId,
        status: hasCachedStreamUrl(videoId) ? 'ready' : 'warming',
      };
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prefetch failed' },
      { status: 500 },
    );
  }
}
