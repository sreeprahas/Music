import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylistTracks } from '@/lib/ytmusicApi';
import { isDownloaded } from '@/lib/downloader';
import { getCachedTracks, setCachedTracks } from '@/lib/db';

export const dynamic = 'force-dynamic';

function uniqueTracks(tracks: Awaited<ReturnType<typeof getPlaylistTracks>>) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.videoId || seen.has(track.videoId)) return false;
    seen.add(track.videoId);
    return true;
  });
}

async function removeDuplicateItems(accessToken: string, tracks: Awaited<ReturnType<typeof getPlaylistTracks>>) {
  const seen = new Set<string>();
  const duplicateItemIds = tracks
    .filter((track) => {
      if (!track.videoId || !track.playlistItemId) return false;
      if (seen.has(track.videoId)) return true;
      seen.add(track.videoId);
      return false;
    })
    .map((track) => track.playlistItemId as string);

  await Promise.all(duplicateItemIds.map((itemId) => fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?id=${encodeURIComponent(itemId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  ).catch(() => null)));
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ tracks: [] });
  }

  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  const limitParam = Number(searchParams.get('limit') || 0);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 0;
  const offsetParam = Number(searchParams.get('offset') || 0);
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
  const end = limit > 0 ? offset + limit : undefined;
  // When ?forceRefresh=1, always fetch from network; otherwise serve cache first
  const forceRefresh = searchParams.get('forceRefresh') === '1';

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Serve from cache immediately unless a force-refresh is requested
  if (!forceRefresh) {
    const cached = getCachedTracks(playlistId);
    if (cached && cached.length > offset) {
      const tracksWithStatus = uniqueTracks(cached).map((t) => ({
        ...t,
        downloaded: isDownloaded(t.videoId),
      }));
      return NextResponse.json({ tracks: tracksWithStatus.slice(offset, end), hasMore: end !== undefined && end < tracksWithStatus.length, fromCache: true });
    }
  }

  const session = await getSession();
  if (!session) {
    const cached = getCachedTracks(playlistId);
    if (cached && cached.length > offset) {
      const tracksWithStatus = uniqueTracks(cached).map((t) => ({
        ...t,
        downloaded: isDownloaded(t.videoId),
      }));
      return NextResponse.json({ tracks: tracksWithStatus.slice(offset, end), hasMore: end !== undefined && end < tracksWithStatus.length, offline: true });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  try {
    const fetchedTracks = await getPlaylistTracks(accessToken, playlistId, offset + limit);
    await removeDuplicateItems(accessToken, fetchedTracks);
    const tracks = uniqueTracks(fetchedTracks);
    const tracksWithStatus = tracks.slice(offset, end).map((t) => ({
      ...t,
      downloaded: isDownloaded(t.videoId),
    }));
    setCachedTracks(playlistId, tracksWithStatus);
    return NextResponse.json({ tracks: tracksWithStatus, hasMore: limit > 0 && tracks.length >= offset + limit });
  } catch (err: unknown) {
    console.error(`[api/playlist] Remote fetch failed for ${playlistId}, using cache:`, err);
    const cached = getCachedTracks(playlistId);
    if (cached) {
      const tracksWithStatus = uniqueTracks(cached).slice(0, limit || undefined).map((t) => ({
        ...t,
        downloaded: isDownloaded(t.videoId),
      }));
      return NextResponse.json({ tracks: tracksWithStatus, offline: true });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
