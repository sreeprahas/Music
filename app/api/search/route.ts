/**
 * GET /api/search
 *
 * Unified search endpoint using yt-dlp metadata search.
 *
 * Query params:
 *   - q:      the search query (required)
 *   - mode:   'auto' (default) | 'youtube' | 'spotify' | 'local'
 *   - filter: 'song' (default) | 'artist' — artist queries rank by artist match
 *   - limit:  max results (default 20, capped at 50)
 */

import { NextResponse } from 'next/server';
import { searchYouTube } from '@/lib/youtube/search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));
  const mode = searchParams.get('mode') || 'auto';
  const filter = searchParams.get('filter') === 'artist' ? 'artist' as const : 'song' as const;

  if (q.length > 200) {
    return NextResponse.json({ error: 'Search query is too long.', mode }, { status: 400 });
  }
  if (!q.trim()) {
    return NextResponse.json({ tracks: [], candidates: [], mode, total: 0 });
  }

  try {
    const { tracks, candidates, artistName } = await searchYouTube(q, { limit, filter });
    return NextResponse.json({
      tracks,
      candidates,
      mode,
      filter,
      artistName: artistName ?? null,
      total: tracks.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Search failed', mode },
      { status: 500 },
    );
  }
}
