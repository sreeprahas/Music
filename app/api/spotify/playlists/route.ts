import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(1, Number(params.get('limit') || 50)));
  const offset = Math.max(0, Number(params.get('offset') || 0));
  try { return NextResponse.json({ playlists: await spotify.getUserPlaylists({ limit, offset }), limit, offset }); }
  catch (error) { return NextResponse.json({ error: toUiMessage(error), playlists: [] }, { status: spotifyErrorStatus(error) }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; description?: string; public?: boolean; collaborative?: boolean };
    if (!body.name?.trim()) return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    const playlist = await spotify.createPlaylist({ name: body.name.trim(), description: body.description, public: body.public, collaborative: body.collaborative });
    return NextResponse.json({ playlist }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}
