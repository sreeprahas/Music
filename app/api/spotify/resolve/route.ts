/**
 * POST /api/spotify/resolve
 *
 * Resolves Spotify input through the SpotiFLAC REST API.
 */

import { NextResponse } from 'next/server';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: unknown;
      artist?: unknown;
      duration?: unknown;
      spotifyId?: unknown;
      album?: unknown;
      thumbnailUrl?: unknown;
    };

    const spotifyId = typeof body.spotifyId === 'string' ? body.spotifyId.trim() : '';
    if (!spotifyId) return NextResponse.json({ error: 'INVALID_SPOTIFY_URL' }, { status: 400 });
    const tracks = await MusicService.resolve(`https://open.spotify.com/track/${spotifyId}`, request.signal);
    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('[spotify/resolve] failed:', error);
    const status = error instanceof MusicServiceError ? (error.status || (error.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    return NextResponse.json(
      { error: error instanceof MusicServiceError ? error.code : 'SPOTIFLAC_ERROR', message: error instanceof Error ? error.message : 'Spotify track resolution failed' },
      { status },
    );
  }
}
