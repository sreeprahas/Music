import { NextResponse } from 'next/server';
import { addCachedTrack, getLocalPlaylists } from '@/lib/db';
import { enqueuePlaylistOperation } from '@/lib/sync/playlist-sync';
import { spotify } from '@/lib/spotify/service';
export async function POST(request: Request) {
  const { playlistId, videoId, track } = await request.json();
  if (!playlistId || !videoId || !track) return NextResponse.json({ error: 'Missing playlistId, videoId, or track' }, { status: 400 });
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  const remotePlaylistId = playlist?.source === 'spotify' && playlist.sourcePlaylistId ? playlist.sourcePlaylistId : playlistId.startsWith('spotify-') ? playlistId.slice('spotify-'.length) : null;
  if (remotePlaylistId) {
    if (!track.spotifyId) return NextResponse.json({ error: 'A Spotify track id is required for a linked playlist' }, { status: 400 });
    try { await spotify.addTracksToPlaylist(remotePlaylistId, [track.spotifyId]); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Spotify playlist update failed' }, { status: 502 }); }
  }
  addCachedTrack(playlistId, { ...track, videoId, playlistId });
  if (playlist) enqueuePlaylistOperation(playlist, 'add', { tracks: [{ ...track, videoId, playlistId }] });
  return NextResponse.json({ success: true, local: true });
}
