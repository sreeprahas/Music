/** Spotify resolve — resolve a Spotify track to a YouTube video ID (with caching). */
import { NextResponse } from 'next/server';
import { matchSpotifyTrack } from '@/lib/matching/spotify-youtube';
import { getYoutubeMapping } from '@/lib/db';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title: string; artist: string; duration?: number; spotifyId?: string; thumbnailUrl?: string };
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

    // 2. Resolve through the deterministic Spotify-to-YouTube matcher.
    const result = await matchSpotifyTrack({ title: body.title, artist: body.artist, duration: body.duration, spotifyId: body.spotifyId, thumbnailUrl: body.thumbnailUrl });
    if (!result.videoId) {
      return NextResponse.json({ error: 'No matching YouTube video found', videoId: null }, { status: 404 });
    }
    return NextResponse.json({ videoId: result.videoId, cached: false, match: result.record });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}
