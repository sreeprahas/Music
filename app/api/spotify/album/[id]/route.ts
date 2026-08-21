import { NextResponse } from 'next/server';
import { spotify } from '@/lib/spotify/service';
import { normalizeTrack } from '@/lib/spotify/normalize';
import { spotifyErrorStatus, toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await spotify.getAlbum(id);
    return NextResponse.json({ album: result.album, tracks: result.items.flatMap((item, index) => item.track ? [normalizeTrack(item.track, index)] : []) });
  } catch (error) { return NextResponse.json({ error: toUiMessage(error) }, { status: spotifyErrorStatus(error) }); }
}
