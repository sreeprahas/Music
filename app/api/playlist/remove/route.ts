import { NextResponse } from 'next/server';
import { removeCachedTrack, getLocalPlaylists, getCachedTracks } from '@/lib/db';
import { enqueuePlaylistOperation } from '@/lib/sync/playlist-sync';

export async function POST(request: Request) {
  const { playlistId, videoId, sourceTrackId } = await request.json();
  if (!playlistId || (!videoId && !sourceTrackId)) {
    return NextResponse.json({ error: 'Missing playlistId or track identity' }, { status: 400 });
  }
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  const track = getCachedTracks(playlistId)?.find((item) => item.videoId === videoId);
  removeCachedTrack(playlistId, videoId, sourceTrackId);
  if (playlist && track) enqueuePlaylistOperation(playlist, 'remove', { tracks: [track] });
  return NextResponse.json({ success: true, local: true });
}
