import { NextResponse } from 'next/server';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown; spotifyId?: unknown };
    const input = typeof body.url === 'string' ? body.url : typeof body.spotifyId === 'string' ? body.spotifyId : '';
    if (!input) return NextResponse.json({ error: 'INVALID_SPOTIFY_URL' }, { status: 400 });
    const tracks = await MusicService.resolve(input, request.signal);
    if (!tracks.length) return NextResponse.json({ error: 'TRACK_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('[music/resolve]', error);
    const status = error instanceof MusicServiceError ? (error.status || (error.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    return NextResponse.json({ error: error instanceof MusicServiceError ? error.code : 'SPOTIFLAC_ERROR', message: error instanceof Error ? error.message : 'Resolution failed' }, { status });
  }
}
