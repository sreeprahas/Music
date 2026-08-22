/**
 * GET /api/search
 *
 * Unified search endpoint. Routes all queries to YouTube Music.
 * The old "spotify" mode is treated as "ytmusic" — no Spotify search API is used.
 *
 * Query params:
 *   - q:     the search query (required)
 *   - mode:  'auto' (default) | 'ytmusic' | 'spotify' | 'local'
 *   - limit: max results (default 20, capped at 50)
 */

import { NextResponse } from 'next/server';
import { searchYouTubeMusic } from '@/lib/youtube/search';
import { getThumbnailUrl } from '@/lib/ytmusicFormat';
import { toUiMessage } from '@/lib/spotify/errors';
import type { Track } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));
  const mode = searchParams.get('mode') || 'auto';

  if (q.length > 200) return NextResponse.json({ error: 'Search query is too long.', mode }, { status: 400 });
  if (!q.trim()) return NextResponse.json({ tracks: [], mode });

  try {
    const candidates = await searchYouTubeMusic(q, limit);
    const tracks: Track[] = candidates.map((c, i) => ({
      videoId: c.videoId,
      title: c.title,
      artist: c.channel || 'Unknown artist',
      thumbnailUrl: getThumbnailUrl(c.videoId, c.title),
      duration: c.duration,
      position: i,
    }));
    return NextResponse.json({ tracks, mode, total: tracks.length });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err), mode }, { status: 500 });
  }
}
