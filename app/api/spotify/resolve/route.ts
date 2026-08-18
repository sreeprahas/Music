/** Spotify resolve — resolve a Spotify track to a YouTube video ID (with caching). */
import { NextResponse } from 'next/server';
import { resolveTrack } from '@/lib/ytdlp/resolver';
import { getYoutubeMapping, setYoutubeMapping } from '@/lib/db';
import type { YoutubeMapping } from '@/lib/db';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title: string; artist: string; duration?: number; spotifyId?: string };
    if (!body.title || !body.artist) {
      return NextResponse.json({ error: 'Missing title or artist' }, { status: 400 });
    }

    // 1. Check the cache first — avoid re-searching YouTube for known tracks.
    if (body.spotifyId) {
      const cached = getYoutubeMapping(body.spotifyId);
      if (cached?.youtubeVideoId) {
        return NextResponse.json({ videoId: cached.youtubeVideoId, cached: true });
      }
    }

    // 2. Resolve via yt-dlp search + scoring.
    const videoId = await resolveTrack({ title: body.title, artist: body.artist, duration: body.duration });
    if (!videoId) {
      return NextResponse.json({ error: 'No matching YouTube video found', videoId: null }, { status: 404 });
    }

    // 3. Cache the mapping for future plays.
    if (body.spotifyId) {
      const mapping: YoutubeMapping = {
        spotifyTrackId: body.spotifyId,
        youtubeVideoId: videoId,
        matchedTitle: body.title,
        matchedArtist: body.artist,
        duration: body.duration,
        resolvedAt: Date.now(),
      };
      setYoutubeMapping(mapping);
    }

    return NextResponse.json({ videoId, cached: false });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}
