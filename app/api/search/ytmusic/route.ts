/**
 * GET /api/search/ytmusic
 *
 * Search YouTube Music tracks using the persistent Python sidecar.
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

  if (!q.trim()) return NextResponse.json({ tracks: [], total: 0 });

  try {
    const candidates = await searchYouTubeMusic(q, limit);
    const tracks = candidates.map((c, i) => candidateToTrack(c, i));
    return NextResponse.json({ tracks, total: tracks.length });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}
