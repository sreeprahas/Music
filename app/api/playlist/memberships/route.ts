import { NextResponse } from 'next/server';
import { getLocalPlaylists, getCachedTracks } from '@/lib/db';
export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
  const playlistIds = getLocalPlaylists().filter((playlist) => (getCachedTracks(playlist.id) || []).some((track) => track.videoId === videoId)).map((playlist) => playlist.id);
  return NextResponse.json({ playlistIds, local: true });
}
