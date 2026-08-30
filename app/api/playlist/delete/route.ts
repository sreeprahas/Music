import { NextResponse } from 'next/server';
import { deleteCachedPlaylist } from '@/lib/db';
import { deletePlaylistThumbnailDir } from '@/lib/storage/thumbnails';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Remove the playlist thumbnail directory (artwork images) first,
  // then clean up the database record.
  try {
    deletePlaylistThumbnailDir(playlistId);
  } catch {
    // Non-fatal — the DB cleanup below is the source of truth.
  }

  deleteCachedPlaylist(playlistId);
  return NextResponse.json({ success: true, playlistId });
}
