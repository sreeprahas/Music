/**
 * GET /api/search
 *
 * Search Spotify metadata through the configured SpotiFLAC service.
 *
 * Query params:
 *   - q:      the search query (required)
 *   - mode:   'auto' (default) | 'youtube' | 'spotify' | 'local'
 *   - filter: 'song' (default) | 'artist' — artist queries rank by artist match
 *   - limit:  max results (default 20, capped at 50)
 */

import { NextResponse } from 'next/server';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));
  const mode = 'spotify';
  const filter = searchParams.get('filter') === 'artist' ? 'artist' as const : 'song' as const;

  if (q.length > 200) {
    return NextResponse.json({ error: 'Search query is too long.', mode }, { status: 400 });
  }
  if (!q.trim()) {
    return NextResponse.json({ tracks: [], candidates: [], mode, total: 0 });
  }

  try {
    const results = await MusicService.search(q);
    const tracks = results.slice(0, limit).map((result, position) => ({
      videoId: result.spotifyId,
      sourceTrackId: result.spotifyId,
      source: 'spotify' as const,
      title: result.title,
      artist: result.artists.join(', '),
      album: result.album,
      duration: result.duration,
      thumbnailUrl: result.artwork || '',
      position,
      quality: result.quality,
      format: result.format,
      provider: result.provider,
    }));
    return NextResponse.json({ tracks, candidates: [], mode, filter, total: tracks.length });
  } catch (err) {
    const status = err instanceof MusicServiceError ? (err.status || (err.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    return NextResponse.json(
      { error: err instanceof MusicServiceError ? err.code : 'SPOTIFLAC_ERROR', message: err instanceof Error ? err.message : 'Search failed', mode },
      { status },
    );
  }
}
