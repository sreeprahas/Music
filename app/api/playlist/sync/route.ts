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
