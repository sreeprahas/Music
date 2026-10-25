import { NextResponse } from 'next/server';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (!query || query.length > 200) return NextResponse.json({ tracks: [], total: 0 }, { status: query.length > 200 ? 400 : 200 });
  try {
    const tracks = await MusicService.search(query);
    return NextResponse.json({ tracks, total: tracks.length });
  } catch (error) {
    const status = error instanceof MusicServiceError ? (error.status || (error.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    console.error('[music/search]', error);
    return NextResponse.json({ error: error instanceof MusicServiceError ? error.code : 'SPOTIFLAC_ERROR', message: error instanceof Error ? error.message : 'Search failed' }, { status });
  }
}
