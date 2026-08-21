/** Spotify playlist [id] — fetch a playlist and its tracks through the provider service. */
import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { normalizePlaylist, normalizePlaylistItems } from '@/lib/spotify/normalize';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });

  try {
    const [playlist, items] = await Promise.all([
      spotify.getPlaylist(id),
      spotify.getPlaylistTracks(id),
    ]);
    const normalized = normalizePlaylist(playlist);
    const tracks = normalizePlaylistItems(items, normalized.id);
    return NextResponse.json({ playlist: normalized, tracks });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: spotifyErrorStatus(err) });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });
  try {
    const body = await request.json() as { name?: string; description?: string; public?: boolean; collaborative?: boolean };
    await spotify.updatePlaylist(id, body);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}
