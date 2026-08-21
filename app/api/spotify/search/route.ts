/** Spotify search through the application-owned provider service. */
import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { normalizeTrack } from '@/lib/spotify/normalize';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));

  if (!q.trim()) return NextResponse.json({ tracks: [] });

  try {
    const result = await spotify.searchTracks(q, limit, offset);
    const tracks = result.items.map((track, i) => normalizeTrack(track, i));
    return NextResponse.json({ tracks, total: result.total, limit: result.limit, offset: result.offset, next: result.next });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: spotifyErrorStatus(err) });
  }
}
