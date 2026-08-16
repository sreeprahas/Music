import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enqueueOperation } from '@/lib/operationEngine';
import { addCachedTrack } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, videoId, track } = await request.json();
    if (!playlistId || !videoId) {
      return NextResponse.json({ error: 'Missing playlistId or videoId' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (track) {
      addCachedTrack(playlistId, track, session.email);
    }

    const targetResource = `playlist:${playlistId}`;
    const idempotencyKey = `op_add_${playlistId}_${videoId}`;

    const op = enqueueOperation({
      type: 'playlist:add',
      targetResource,
      payload: { playlistId, videoId, track },
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
      { error: error instanceof Error ? error.message : 'Failed to add song to playlist' },
      { status: 500 }
    );
  }
}
