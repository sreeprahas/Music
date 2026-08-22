import { NextResponse } from 'next/server';
import { getPlaylistSyncState, syncPlaylist } from '@/lib/sync/playlist-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('playlistId');
  if (!id) return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  return NextResponse.json({ state: getPlaylistSyncState(id) || null });
}

export async function POST(request: Request) {
  try {
    const { playlistId } = await request.json() as { playlistId?: string };
    if (!playlistId) return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
    return NextResponse.json({ state: await syncPlaylist(playlistId) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Synchronization failed' }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  try {
    const { playlistId, syncOnOpen } = await request.json() as { playlistId?: string; syncOnOpen?: boolean };
    if (!playlistId || typeof syncOnOpen !== 'boolean') {
      return NextResponse.json({ error: 'Missing playlistId or syncOnOpen boolean' }, { status: 400 });
    }
    const { setPlaylistSyncOnOpen, getPlaylistById } = await import('@/lib/storage/playlists');
    setPlaylistSyncOnOpen(playlistId, syncOnOpen);
    const updated = getPlaylistById(playlistId);
    return NextResponse.json({ success: true, playlist: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update sync setting' }, { status: 500 });
  }
}
