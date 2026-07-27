import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylistTracks } from '@/lib/ytmusicApi';
import { isDownloaded } from '@/lib/downloader';
import { getCachedTracks, setCachedTracks } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse | Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ tracks: [] });
  }

  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  // When ?forceRefresh=1, always fetch from network; otherwise serve cache first
  const forceRefresh = searchParams.get('forceRefresh') === '1';

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Serve from cache immediately unless a force-refresh is requested
  if (!forceRefresh) {
    const cached = getCachedTracks(playlistId);
    if (cached && cached.length > 0) {
      const tracksWithStatus = cached.map((t) => ({
        ...t,
        downloaded: isDownloaded(t.videoId),
      }));
      return NextResponse.json({ tracks: tracksWithStatus, fromCache: true });
    }
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  try {
    const tracks = await getPlaylistTracks(accessToken, playlistId);
    const tracksWithStatus = tracks.map((t) => ({
      ...t,
      downloaded: isDownloaded(t.videoId),
    }));
    setCachedTracks(playlistId, tracksWithStatus);
    return NextResponse.json({ tracks: tracksWithStatus });
  } catch (err: unknown) {
    console.error(`[api/playlist] Remote fetch failed for ${playlistId}, using cache:`, err);
    const cached = getCachedTracks(playlistId);
    if (cached) {
      const tracksWithStatus = cached.map((t) => ({
        ...t,
        downloaded: isDownloaded(t.videoId),
      }));
      return NextResponse.json({ tracks: tracksWithStatus, offline: true });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
