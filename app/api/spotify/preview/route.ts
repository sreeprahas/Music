/**
 * POST /api/spotify/preview
 *
 * Phase 1 — fast playlist preview.
 *
 * Body: { url: string }
 * Returns: { playlistName, coverImage, tracks: [{ name, artists, image, duration_ms }] }
 *
 * Only fetches the public Spotify embed page — no OAuth, no credentials.
 * Frontend uses this to render a 10-track preview before the user confirms import.
 */

import { NextResponse } from 'next/server';
import { MusicService } from '@/lib/music/spotiflac';
import { extractPlaylistId } from '@/lib/spotify/validation';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };

    if (typeof body.url !== 'string' || body.url.length > 2000) {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    const playlistId = extractPlaylistId(body.url);
    if (!playlistId) {
      return NextResponse.json(
        { error: 'Not a valid Spotify playlist URL. Expected: https://open.spotify.com/playlist/...' },
        { status: 400 },
      );
    }

    const tracks = await MusicService.resolve(body.url);
    return NextResponse.json({ playlistName: 'Spotify Playlist', coverImage: tracks[0]?.artwork || '', totalTracks: tracks.length, tracks: tracks.slice(0, 10).map((track) => ({ name: track.title, artists: track.artists.join(', '), image: track.artwork || '', duration_ms: track.duration * 1000, spotifyTrackId: track.spotifyId, album: track.album })) });
  } catch (err) {
    const message = toUiMessage(err);
    const status =
      (err as { status?: number })?.status === 404
        ? 404
        : message.includes('rate limit') || message.includes('Rate limit')
          ? 429
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
