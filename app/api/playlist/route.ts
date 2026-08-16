import { NextResponse } from 'next/server';
import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylistTracks } from '@/lib/ytmusicApi';
import { isDownloaded } from '@/lib/downloader';
import { getCachedTracks, setCachedTracks } from '@/lib/db';
import { getPendingPlaylistMutations } from '@/lib/operationEngine';

export const dynamic = 'force-dynamic';

function uniqueTracks(tracks: Awaited<ReturnType<typeof getPlaylistTracks>>) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.videoId || seen.has(track.videoId)) return false;
    seen.add(track.videoId);
    return true;
  });
}

function applyPendingMutations(tracks: Awaited<ReturnType<typeof getPlaylistTracks>>, playlistId: string, accountId = '') {
  const effective = [...tracks];
  for (const mutation of getPendingPlaylistMutations(playlistId, accountId)) {
    const index = effective.findIndex((track) => track.videoId === mutation.videoId);
    if (mutation.operation === 'remove') {
      if (index >= 0) effective.splice(index, 1);
    } else if (index < 0 && mutation.track) {
      effective.push({ ...mutation.track, playlistId, playlistItemId: undefined, position: effective.length });
    }
  }
  return effective.map((track, index) => ({ ...track, position: index }));
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  const limitParam = Number(searchParams.get('limit') || 0);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 0;
  const offsetParam = Number(searchParams.get('offset') || 0);
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
  const end = limit > 0 ? offset + limit : undefined;
  // When ?forceRefresh=1, always fetch from network; otherwise serve cache first
  const forceRefresh = searchParams.get('forceRefresh') === '1';
  const previewOnly = searchParams.get('preview') === '1';

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }
  if (playlistId === 'LL' || playlistId === 'LM') {
    return NextResponse.json({ error: 'Liked Songs is not supported' }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;
  const accountId = session.email;
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  try {
    const fetchedTracks = await getPlaylistTracks({ accessToken, refreshToken, expiresAt }, playlistId, offset + limit);
    const tracks = applyPendingMutations(uniqueTracks(fetchedTracks), playlistId, accountId);
    const tracksWithStatus = tracks.slice(offset, end).map((t) => ({
      ...t,
      downloaded: isDownloaded(t.videoId),
    }));
    // Cache the effective state, never the stale remote snapshot, while work
    // is still pending. This prevents a reload from resurrecting a mutation.
    if (!previewOnly) setCachedTracks(playlistId, tracks, accountId);
    return NextResponse.json({ tracks: tracksWithStatus, hasMore: limit > 0 && tracks.length >= offset + limit });
  } catch (err: unknown) {
    console.error(`[api/playlist] Remote fetch failed for ${playlistId}, using cache:`, err);
    const cached = getCachedTracks(playlistId, accountId);
    if (cached) {
      const tracksWithStatus = applyPendingMutations(uniqueTracks(cached), playlistId, accountId).slice(0, limit || undefined).map((t) => ({
        ...t,
        downloaded: isDownloaded(t.videoId),
      }));
      return NextResponse.json({ tracks: tracksWithStatus, offline: true });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
