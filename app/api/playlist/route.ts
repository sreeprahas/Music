import { NextResponse } from 'next/server';
import { getCachedTracks, setCachedTracks, upsertLocalPlaylist, downloadAllTrackThumbnails, findLocalPlaylistBySourceUrl } from '@/lib/db';
import { isDownloaded } from '@/lib/downloader';
import { getThumbnailUrl } from '@/lib/ytmusicFormat';
import type { Playlist, Track } from '@/types';

export const dynamic = 'force-dynamic';

function page(tracks: Track[], offset: number, limit: number) {
  const end = limit > 0 ? offset + limit : undefined;
  return { tracks: tracks.slice(offset, end).map((track) => ({ ...track, downloaded: isDownloaded(track.videoId) })), hasMore: Boolean(limit && end && tracks.length > end) };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  if (!playlistId) return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  if (playlistId === 'LL' || playlistId === 'LM') return NextResponse.json({ error: 'Liked Songs is not supported' }, { status: 404 });
  const tracks = getCachedTracks(playlistId) || [];
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const limit = Math.max(0, Number(searchParams.get('limit') || 0));
  return NextResponse.json(page(tracks, offset, limit));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; url?: string };
    if (body.action !== 'import' || !body.url) {
      return NextResponse.json({ error: 'Expected action: import and a playlist URL' }, { status: 400 });
    }

    // 0. Deduplication — if this exact URL was already imported, return the existing playlist.
    const existing = findLocalPlaylistBySourceUrl(body.url);
    if (existing) {
      const existingTracks = getCachedTracks(existing.id) || [];
      return NextResponse.json({ success: true, local: true, playlist: existing, tracks: existingTracks, duplicate: true });
    }

    // 1. Fetch playlist metadata (tracks carry raw remote thumbnailUrl from the source adapter)
    const imported = await import('@/lib/playlistImporter').then((m) => m.importPlaylistUrl(body.url!));

    // 2. Replace thumbnailUrls with local API URLs immediately — the actual
    //    image download happens on app launch via /api/download-metadata-images.
    //    This makes import much faster (no waiting for 50+ image downloads).
    const tracksWithLocalThumbs = imported.tracks.map((track) => ({
      ...track,
      thumbnailUrl: getThumbnailUrl(track.videoId, track.title),
    }));

    // 3. Update the playlist's own thumbnailUrl to point to its first track's local image
    const playlist: Playlist = {
      ...imported.playlist,
      thumbnailUrl: tracksWithLocalThumbs[0]
        ? getThumbnailUrl(tracksWithLocalThumbs[0].videoId, tracksWithLocalThumbs[0].title)
        : '',
    };

    // 4. Persist — metadata now contains only local /api/thumbnail URLs
    const stored = upsertLocalPlaylist(playlist, tracksWithLocalThumbs);
    setCachedTracks(stored.id, tracksWithLocalThumbs);

    // 5. Trigger thumbnail download in the background (non-blocking).
    //    The /api/thumbnail endpoint will serve remote images as a fallback until
    //    the local files are downloaded.
    downloadAllTrackThumbnails(imported.tracks).catch(() => { /* non-blocking */ });

    return NextResponse.json({ success: true, local: true, playlist: stored, tracks: tracksWithLocalThumbs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Playlist import failed' }, { status: 500 });
  }
}
