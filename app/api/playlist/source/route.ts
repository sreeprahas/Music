import { NextResponse } from 'next/server';
import { getCachedTracks, getLocalPlaylists, setCachedTracks, upsertLocalPlaylist } from '@/lib/db';
import { importPlaylistUrl } from '@/lib/playlistImporter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, sourceUrl } = await request.json() as { playlistId?: string; sourceUrl?: string };
    if (!playlistId || !sourceUrl) return NextResponse.json({ error: 'Missing playlistId or sourceUrl' }, { status: 400 });
    const existing = getLocalPlaylists().find((playlist) => playlist.id === playlistId);
    if (!existing) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    const imported = await importPlaylistUrl(sourceUrl);
    const playlist = upsertLocalPlaylist({ ...imported.playlist, id: existing.id, createdAt: existing.createdAt, importedAt: new Date().toISOString(), sourceUrl });
    setCachedTracks(existing.id, imported.tracks.map((track, position) => ({ ...track, playlistId: existing.id, position })));
    return NextResponse.json({ success: true, playlist, tracks: getCachedTracks(existing.id) || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Source replacement failed' }, { status: 400 }); }
}
