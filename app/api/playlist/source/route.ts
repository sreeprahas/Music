import { NextResponse } from 'next/server';
import { getLocalPlaylists } from '@/lib/db';
import { reconcilePlaylist } from '@/lib/storage/playlists';
import { importPlaylistUrl } from '@/lib/playlistImporter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { playlistId, sourceUrl } = (await request.json()) as { playlistId?: string; sourceUrl?: string };
    if (!playlistId || !sourceUrl) {
      return NextResponse.json({ error: 'Missing playlistId or sourceUrl' }, { status: 400 });
    }
    const existing = getLocalPlaylists().find((playlist) => playlist.id === playlistId);
    if (!existing) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });

    const imported = await importPlaylistUrl(sourceUrl);
    // Preserve local identity (same ID, keep original createdAt)
    const merged = {
      ...imported.playlist,
      id: existing.id,
      createdAt: existing.createdAt,
      importedAt: new Date().toISOString(),
      sourceUrl,
    };
    const now = new Date().toISOString();
    const tracks = imported.tracks.map((track, position) => ({ ...track, playlistId: existing.id, position, dateAdded: track.dateAdded ?? now }));

    const { playlist, tracks: storedTracks } = await reconcilePlaylist(
      merged,
      tracks,
      imported.playlist.thumbnailUrl || undefined,
    );

    return NextResponse.json({ success: true, playlist, tracks: storedTracks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Source replacement failed' },
      { status: 400 },
    );
  }
}
