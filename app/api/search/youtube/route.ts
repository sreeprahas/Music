/**
 * GET & POST /api/search/youtube
 *
 * Lightweight YouTube metadata search using yt-dlp.
 */

import { NextResponse } from 'next/server';
import { searchYouTube } from '@/lib/youtube/search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || searchParams.get('query') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));

  if (!q.trim()) {
    return NextResponse.json({ tracks: [], candidates: [], total: 0 });
  }

  try {
    const { tracks, candidates } = await searchYouTube(q, { limit });
    return NextResponse.json({
      tracks,
      candidates,
      total: tracks.length,
      source: 'youtube',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'YouTube search failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string; q?: string; limit?: number };
    const query = body.query || body.q || '';
    const limit = Math.min(50, Math.max(1, Number(body.limit || 20)));

    if (!query.trim()) {
      return NextResponse.json({ tracks: [], candidates: [], total: 0 });
    }

    const { tracks, candidates } = await searchYouTube(query, { limit });
    return NextResponse.json({
      tracks,
      candidates,
      total: tracks.length,
      source: 'youtube',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'YouTube search failed' },
      { status: 500 },
    );
  }
}
