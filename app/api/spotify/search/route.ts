/** Spotify search — search tracks anonymously via the noauth guest token. */
import { NextResponse } from 'next/server';
import { searchTracksNoauth } from '@/lib/spotify/noauthApi';
import { normalizeTrack } from '@/lib/spotify/normalize';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));

  if (!q.trim()) return NextResponse.json({ tracks: [] });

  try {
    const result = await searchTracksNoauth(q, limit);
    const tracks = result.items.map((track, i) => normalizeTrack(track, i));
    return NextResponse.json({ tracks, total: result.total });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}
