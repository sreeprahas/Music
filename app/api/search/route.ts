/**
 * GET /api/search
 *
 * Unified search endpoint routing queries to YouTube Music via the persistent sidecar.
 *
 * Query params:
 *   - q:     the search query (required)
 *   - mode:  'auto' (default) | 'ytmusic' | 'songs' | 'artists' | 'albums' | 'playlists'
 *   - limit: max results (default 20, capped at 50)
 */

import { NextResponse } from 'next/server';
import { searchYouTubeMusic } from '@/lib/youtube/search';
import { candidateToTrack } from '@/lib/youtube/adapter';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));
  const mode = searchParams.get('mode') || 'auto';

  if (q.length > 200) return NextResponse.json({ error: 'Search query is too long.', mode }, { status: 400 });
  if (!q.trim()) return NextResponse.json({ tracks: [], mode, total: 0 });

  try {
    const filter = ['artists', 'albums', 'playlists', 'videos'].includes(mode)
      ? (mode as any)
      : 'songs';

    const candidates = await searchYouTubeMusic(q, limit, undefined, { filter });
    const tracks = candidates.map((c, i) => candidateToTrack(c, i));

    return NextResponse.json({ tracks, candidates, mode, total: tracks.length });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err), mode }, { status: 500 });
  }
}
