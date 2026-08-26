import { NextResponse } from 'next/server';
import { getCachedTracks } from '@/lib/db';
import { isDownloaded } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function page(tracks: import('@/types').Track[], offset: number, limit: number) {
  const end = limit > 0 ? offset + limit : undefined;
  return {
    tracks: tracks
      .slice(offset, end)
      .map((track) => ({ ...track, downloaded: isDownloaded(track.videoId) })),
    hasMore: Boolean(limit && end && tracks.length > end),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  if (!playlistId) return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  if (playlistId === 'LL' || playlistId === 'LM') {
    return NextResponse.json({ error: 'Liked Songs is not supported' }, { status: 404 });
  }
  const tracks = getCachedTracks(playlistId);
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const limit = Math.max(0, Number(searchParams.get('limit') || 0));
  return NextResponse.json(page(tracks, offset, limit));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; url?: string; title?: string; description?: string };
    
    if (body.action === 'create') {
      const { upsertPlaylist, allocateUniquePlaylistTitle } = await import('@/lib/storage/playlists');
      const title = allocateUniquePlaylistTitle(typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New Playlist');
      const now = new Date().toISOString();
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const playlist = {
        id,
        title,
        description: typeof body.description === 'string' ? body.description.trim() : '',
        thumbnailUrl: '',
        trackCount: 0,
        source: 'local' as const,
        createdAt: now,
      };
      upsertPlaylist(playlist);
      return NextResponse.json({ success: true, local: true, playlist, tracks: [] });
    }

    if (body.action !== 'import' || !body.url) {
      return NextResponse.json(
        { error: 'Expected action: import (with url) or action: create (with title)' },
        { status: 400 },
      );
    }

    console.log(`[SpotifyImport] API route POST received import request for: ${body.url}`);
    const { reconcilePlaylist } = await import('@/lib/storage/playlists');
    const { importPlaylistUrl } = await import('@/lib/playlistImporter');

    const imported = await importPlaylistUrl(body.url!);
    const requestedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    if (requestedTitle) imported.playlist.title = requestedTitle;
    console.log(`[SpotifyImport] metadata retrieved, persisting ${imported.tracks.length} tracks to SQLite`);

    // Persist via reconcile (transactional + thumbnail download)
    const { playlist, tracks } = await reconcilePlaylist(
      imported.playlist,
      imported.tracks,
      imported.playlist.thumbnailUrl || undefined,
    );
    console.log(`[SpotifyImport] SQLite persistence complete, API route returning response for: ${playlist.id}`);

    return NextResponse.json({ success: true, local: true, playlist, tracks });
  } catch (error) {
    console.error(`[SpotifyImport] API route import error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Playlist import failed' },
      { status: 500 },
    );
  }
}
