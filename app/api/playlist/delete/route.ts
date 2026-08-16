import { NextResponse } from 'next/server';
import { deleteCachedPlaylist } from '@/lib/db';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Remove from local cache immediately
  deleteCachedPlaylist(playlistId);

  return NextResponse.json({ success: true, playlistId });
}
