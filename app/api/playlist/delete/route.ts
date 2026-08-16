import { NextResponse } from 'next/server';
import { deleteCachedPlaylist } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  deleteCachedPlaylist(playlistId, session.email);

  return NextResponse.json({ success: true, playlistId });
}
