import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enqueueOperation } from '@/lib/operationEngine';
import { removeCachedTrack } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, playlistItemId, videoId } = await request.json();
    if (!playlistId || (!playlistItemId && !videoId)) {
      return NextResponse.json({ error: 'Missing playlistId and track identifier' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (videoId) {
      removeCachedTrack(playlistId, videoId, session.email);
    }

    const targetResource = `playlist:${playlistId}`;
    const idempotencyKey = `op_remove_${playlistId}_${videoId || playlistItemId}`;

    const op = enqueueOperation({
      type: 'playlist:remove',
      targetResource,
      payload: { playlistId, videoId, playlistItemId },
      session,
      idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      queued: true,
      operationId: op.id,
      status: op.status,
      commandId: op.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove song from playlist' },
      { status: 500 }
    );
  }
}
