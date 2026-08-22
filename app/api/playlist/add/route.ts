import { NextResponse } from 'next/server';
import { addCachedTrack, getLocalPlaylists } from '@/lib/db';
import { enqueuePlaylistOperation } from '@/lib/sync/playlist-sync';

export async function POST(request: Request) {
  const { playlistId, videoId, track } = await request.json();
  if (!playlistId || !videoId || !track) {
    return NextResponse.json({ error: 'Missing playlistId, videoId, or track' }, { status: 400 });
  }
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  addCachedTrack(playlistId, { ...track, videoId, playlistId });
  if (playlist) enqueuePlaylistOperation(playlist, 'add', { tracks: [{ ...track, videoId, playlistId }] });
  return NextResponse.json({ success: true, local: true });
}
