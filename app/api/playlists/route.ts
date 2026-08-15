import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylists } from '@/lib/ytmusicApi';
import { getCachedPlaylists, getCachedTracks, setCachedPlaylists } from '@/lib/db';

export const dynamic = 'force-dynamic';

function withLocalArtwork(playlists: Awaited<ReturnType<typeof getCachedPlaylists>>) {
  return playlists.map((playlist) => {
    const tracks = getCachedTracks(playlist.id)?.slice(0, 4) || [];
    return {
      ...playlist,
      thumbnailUrls: tracks.map((track) => track.thumbnailUrl).filter(Boolean),
      thumbnailVideoIds: tracks.map((track) => track.videoId),
    };
  });
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ playlists: [] });
  }

  const { searchParams } = new URL(request.url);
  // When ?forceRefresh=1, always fetch from network; otherwise serve cache first
  const forceRefresh = searchParams.get('forceRefresh') === '1';

  // Serve from cache immediately unless a force-refresh is requested
  if (!forceRefresh) {
    const cached = getCachedPlaylists();
    if (cached.length > 0) {
      return NextResponse.json({ playlists: withLocalArtwork(cached), fromCache: true });
    }
  }

  const session = await getSession();
  if (!session) {
    const cached = getCachedPlaylists();
    if (cached.length > 0) {
      return NextResponse.json({ playlists: withLocalArtwork(cached), offline: true });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;

  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
    }
  }

  try {
    const playlists = await getPlaylists(accessToken);
    setCachedPlaylists(playlists);
    return NextResponse.json({ playlists: withLocalArtwork(playlists) });
  } catch (err: unknown) {
    console.error('[api/playlists] Remote fetch failed, using cache:', err);
    const cached = getCachedPlaylists();
    if (cached.length > 0) {
      return NextResponse.json({ playlists: withLocalArtwork(cached), offline: true });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
