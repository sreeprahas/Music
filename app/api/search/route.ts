/**
 * Merged search — the dual search engine endpoint.
 *
 * Query params:
 *   - q:     the search query (required)
 *   - mode:  'auto' (default) | 'spotify' | 'ytmusic'
 *   - limit: max results per source (default 20, capped at 50)
 *
 * In 'auto' mode, Spotify and YouTube Music GraphQL searches run in parallel,
 * results are deduplicated, and Spotify results take priority. The YTMusic
 * videoId is absorbed onto matching Spotify tracks so playback can skip the
 * YouTube resolution step.
 */

import { NextResponse } from 'next/server';
import { dualSearch, type SearchMode } from '@/lib/spotify/dualSearch';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const modeParam = (searchParams.get('mode') || 'auto').toLowerCase();
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));

  const mode: SearchMode = (['auto', 'spotify', 'ytmusic'] as const).includes(modeParam as SearchMode)
    ? (modeParam as SearchMode)
    : 'auto';

  if (!q.trim()) return NextResponse.json({ tracks: [], mode });

  try {
    const tracks = await dualSearch(q, mode, limit);
    return NextResponse.json({ tracks, mode, total: tracks.length });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err), mode }, { status: 500 });
  }
}
