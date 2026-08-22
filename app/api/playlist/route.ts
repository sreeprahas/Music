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
    const body = (await request.json()) as { action?: string; url?: string };
    if (body.action !== 'import' || !body.url) {
      return NextResponse.json(
        { error: 'Expected action: import and a playlist URL' },
        { status: 400 },
      );
    }

    const { reconcilePlaylist } = await import('@/lib/storage/playlists');
    const { importPlaylistUrl } = await import('@/lib/playlistImporter');

    const imported = await importPlaylistUrl(body.url!);

    // Persist via reconcile (transactional + thumbnail download)
    const { playlist, tracks } = await reconcilePlaylist(
      imported.playlist,
      imported.tracks,
      imported.playlist.thumbnailUrl || undefined,
    );

    return NextResponse.json({ success: true, local: true, playlist, tracks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Playlist import failed' },
      { status: 500 },
    );
  }
}
