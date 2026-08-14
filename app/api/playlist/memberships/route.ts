import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylists } from '@/lib/ytmusicApi';

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
    const playlists = (await getPlaylists(accessToken)).filter((playlist) => playlist.id !== 'LL');
    const memberships = await Promise.all(playlists.map(async (playlist) => {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'id');
      url.searchParams.set('playlistId', playlist.id);
      url.searchParams.set('videoId', videoId);
      url.searchParams.set('maxResults', '1');
      try {
        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        return data.items?.length ? playlist.id : null;
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
