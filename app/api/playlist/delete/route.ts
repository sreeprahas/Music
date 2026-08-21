import { NextResponse } from 'next/server';
import { deleteCachedPlaylist } from '@/lib/db';
import { spotify } from '@/lib/spotify/service';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  if (playlistId.startsWith('spotify-')) {
    try {
      await spotify.removePlaylist(playlistId.slice('spotify-'.length));
      return NextResponse.json({ success: true, playlistId, remote: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Spotify playlist removal failed' }, { status: 502 });
    }
  }

  deleteCachedPlaylist(playlistId);

  return NextResponse.json({ success: true, playlistId });
}
