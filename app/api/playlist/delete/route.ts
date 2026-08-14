import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteCachedPlaylist } from '@/lib/db';
import { enqueueOperation } from '@/lib/operationEngine';

export async function DELETE(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Remove from local cache immediately
  deleteCachedPlaylist(playlistId);

  // If user is authenticated, enqueue durable operation to delete from YouTube API
  const session = await getSession();
  let operationId: string | undefined;

  if (session) {
    const targetResource = `playlist:${playlistId}`;
    const idempotencyKey = `op_delete_${playlistId}`;
    const op = enqueueOperation({
      type: 'playlist:delete',
      targetResource,
      payload: { playlistId },
      session,
      idempotencyKey,
    });
    operationId = op.id;
  }

  return NextResponse.json({ success: true, playlistId, operationId });
}
