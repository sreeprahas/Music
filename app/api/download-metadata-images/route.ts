import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { getLocalPlaylists } = await import('@/lib/storage/playlists');
    const { getPlaylistTracks } = await import('@/lib/storage/tracks');
    const { downloadAllMetadataImages } = await import('@/lib/storage/thumbnails');

    const playlists = getLocalPlaylists();
    const allTracks = playlists.map((pl) => ({ playlistId: pl.id, tracks: getPlaylistTracks(pl.id) }));
    const result = await downloadAllMetadataImages(
      playlists.map((pl) => ({ id: pl.id, thumbnailUrl: pl.thumbnailUrl })),
      allTracks,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to download metadata images', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}