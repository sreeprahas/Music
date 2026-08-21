import { NextResponse } from 'next/server';
import { removeCachedTrack, getLocalPlaylists, getCachedTracks } from '@/lib/db';
import { enqueuePlaylistOperation } from '@/lib/sync/playlist-sync';
import { spotify } from '@/lib/spotify/service';
export async function POST(request: Request) {
  const { playlistId, videoId, spotifyId } = await request.json();
  if (!playlistId || !videoId) return NextResponse.json({ error: 'Missing playlistId or videoId' }, { status: 400 });
  const playlist = getLocalPlaylists().find((item) => item.id === playlistId);
  const remotePlaylistId = playlist?.source === 'spotify' && playlist.sourcePlaylistId ? playlist.sourcePlaylistId : playlistId.startsWith('spotify-') ? playlistId.slice('spotify-'.length) : null;
  if (remotePlaylistId) {
    if (!spotifyId) return NextResponse.json({ error: 'A Spotify track id is required for a linked playlist' }, { status: 400 });
    try { await spotify.removeTracksFromPlaylist(remotePlaylistId, [spotifyId]); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Spotify playlist update failed' }, { status: 502 }); }
  }
  const track = getCachedTracks(playlistId)?.find((item) => item.videoId === videoId);
  removeCachedTrack(playlistId, videoId);
  if (playlist && track) enqueuePlaylistOperation(playlist, 'remove', { tracks: [track] });
  return NextResponse.json({ success: true, local: true });
}
