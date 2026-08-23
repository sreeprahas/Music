import { NextResponse } from 'next/server';
import { addCachedTrack, getLocalPlaylists } from '@/lib/db';
import { enqueuePlaylistOperation } from '@/lib/sync/playlist-sync';

export async function POST(request: Request) {
  const { playlistId, videoId, sourceTrackId, track } = await request.json();
  if (!playlistId || (!videoId && !sourceTrackId && !track?.sourceTrackId) || !track) {
    return NextResponse.json({ error: 'Missing playlistId, track identity, or track' }, { status: 400 });
  }
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  const savedTrack = { ...track, videoId: videoId || track.videoId || '', sourceTrackId: sourceTrackId || track.sourceTrackId, playlistId };
  addCachedTrack(playlistId, savedTrack);
  if (playlist) enqueuePlaylistOperation(playlist, 'add', { tracks: [savedTrack] });
  return NextResponse.json({ success: true, local: true });
}
