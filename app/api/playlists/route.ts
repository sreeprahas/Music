import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylists } from '@/lib/ytmusicApi';
import { getCachedPlaylists, getCachedTracks, setCachedPlaylists } from '@/lib/db';

export const dynamic = 'force-dynamic';

function withLocalArtwork(playlists: Awaited<ReturnType<typeof getCachedPlaylists>>, accountId: string) {
  return playlists.filter((playlist) => playlist.id !== 'LL' && playlist.id !== 'LM').map((playlist) => {
    const tracks = getCachedTracks(playlist.id, accountId)?.slice(0, 4) || [];
    return {
      ...playlist,
      thumbnailUrls: tracks.map((track) => track.thumbnailUrl).filter(Boolean),
      thumbnailVideoIds: tracks.map((track) => track.videoId),
    };
  });
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url);
  // When ?forceRefresh=1, always fetch from network; otherwise serve cache first
  const forceRefresh = searchParams.get('forceRefresh') === '1';

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;
  const accountId = session.email;
  const cachedBeforeRefresh = getCachedPlaylists(accountId);

  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
    }
  }

  try {
    const playlists = await getPlaylists({ accessToken, refreshToken, expiresAt });
    // A transient upstream/auth response can contain only Liked Songs. Never
    // destroy a larger valid cache with that partial snapshot.
    if (playlists.length <= 1 && cachedBeforeRefresh.length > playlists.length) {
      return NextResponse.json({ playlists: withLocalArtwork(cachedBeforeRefresh, accountId), fromCache: true, stale: true });
    }
    const supportedPlaylists = playlists.filter((playlist) => playlist.id !== 'LL' && playlist.id !== 'LM');
    setCachedPlaylists(supportedPlaylists, accountId);
    return NextResponse.json({ playlists: withLocalArtwork(supportedPlaylists, accountId) });
  } catch (err: unknown) {
    console.error('[api/playlists] Remote fetch failed, using cache:', err);
    const cached = getCachedPlaylists(accountId);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const quotaExceeded = /quotaExceeded|dailyLimitExceeded|quota.*exceed/i.test(message);
    if (cached.length > 0) {
      return NextResponse.json({ playlists: withLocalArtwork(cached, accountId), offline: true, quotaExceeded });
    }
    return NextResponse.json({ error: message, quotaExceeded }, { status: quotaExceeded ? 429 : 500 });
  }
}
