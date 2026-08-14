import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enqueueOperation } from '@/lib/operationEngine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { playlistId, videoIds } = await request.json();
    if (!playlistId || !Array.isArray(videoIds)) {
      return NextResponse.json({ error: 'Missing playlistId or videoIds array' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const targetResource = `playlist:${playlistId}`;
    const idempotencyKey = `op_reorder_${playlistId}_${Date.now()}`;

    const op = enqueueOperation({
      type: 'playlist:reorder',
      targetResource,
      payload: { playlistId, videoIds },
      session,
      idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      queued: true,
      operationId: op.id,
      status: op.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reorder playlist' },
      { status: 500 }
    );
  }
}
