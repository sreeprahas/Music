import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylists, getPlaylistTracks } from '@/lib/ytmusicApi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let { accessToken, refreshToken, expiresAt } = session;
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  try {
    const playlists = (await getPlaylists({ accessToken, refreshToken, expiresAt })).filter((playlist) => playlist.id !== 'LL');
    const ytmSession = { accessToken, refreshToken, expiresAt };
    const memberships = await Promise.all(playlists.map(async (playlist) => {
      try {
        const tracks = await getPlaylistTracks(ytmSession, playlist.id);
        return tracks.some((track) => track.videoId === videoId) ? playlist.id : null;
      } catch {
        return null;
      }
    }));

    return NextResponse.json({ playlistIds: memberships.filter((id): id is string => Boolean(id)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load playlist memberships' },
      { status: 500 }
    );
  }
}
