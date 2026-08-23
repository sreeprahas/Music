import { NextResponse } from 'next/server';
import { getLocalPlaylists, getCachedTracks } from '@/lib/db';
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const videoId = searchParams.get('videoId') || '';
  const sourceTrackId = searchParams.get('sourceTrackId') || '';
  if (!videoId && !sourceTrackId) return NextResponse.json({ error: 'Missing track identity' }, { status: 400 });
  const playlistIds = getLocalPlaylists().filter((playlist) => (getCachedTracks(playlist.id) || []).some((track) =>
    (videoId && track.videoId === videoId) || (sourceTrackId && track.sourceTrackId === sourceTrackId)
  )).map((playlist) => playlist.id);
  return NextResponse.json({ playlistIds, local: true });
}
