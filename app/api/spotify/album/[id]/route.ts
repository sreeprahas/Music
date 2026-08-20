import { NextResponse } from 'next/server';
import { getAlbumGraphQl } from '@/lib/spotify/graphqlApi';
import { normalizeTrack } from '@/lib/spotify/normalize';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getAlbumGraphQl(id);
    return NextResponse.json({ album: result.album, tracks: result.items.flatMap((item, index) => item.track ? [normalizeTrack(item.track, index)] : []) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Album lookup failed' }, { status: 500 }); }
}
