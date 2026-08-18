/** Spotify playlist [id] — fetch a single playlist with all its tracks (paginated, noauth). */
import { NextResponse } from 'next/server';
import { getPlaylistNoauth, getPlaylistTracksNoauth } from '@/lib/spotify/noauthApi';
import { normalizePlaylist, normalizePlaylistItems } from '@/lib/spotify/normalize';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });

  try {
    const [playlist, items] = await Promise.all([
      getPlaylistNoauth(id),
      getPlaylistTracksNoauth(id),
    ]);
    const normalized = normalizePlaylist(playlist);
    const tracks = normalizePlaylistItems(items, normalized.id);
    return NextResponse.json({ playlist: normalized, tracks });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}
