import { NextResponse } from 'next/server';
import { reorderCachedTracks, getLocalPlaylists } from '@/lib/db';
import { enqueuePlaylistOperation } from '@/lib/sync/playlist-sync';
export async function POST(request: Request) {
  const { playlistId, videoIds } = await request.json();
  if (!playlistId || !Array.isArray(videoIds)) return NextResponse.json({ error: 'Missing playlistId or videoIds' }, { status: 400 });
  const ordered = reorderCachedTracks(playlistId, videoIds);
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  if (playlist) enqueuePlaylistOperation(playlist, 'reorder', { videoIds, tracks: ordered });
  return NextResponse.json({ success: true, local: true });
}
