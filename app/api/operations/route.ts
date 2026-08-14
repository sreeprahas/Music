import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enqueueOperation, getOperations, OperationType } from '@/lib/operationEngine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { type, targetResource, payload, idempotencyKey, maxAttempts } = body;

    if (!type || !targetResource || !payload) {
      return NextResponse.json(
        { error: 'Missing required parameters: type, targetResource, payload' },
        { status: 400 }
      );
    }

    const validTypes: OperationType[] = [
      'playlist:add',
      'playlist:remove',
      'playlist:reorder',
      'playlist:delete',
      'playlist:create',
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid operation type: ${type}` }, { status: 400 });
    }

    const op = enqueueOperation({
      type,
      targetResource,
      payload,
      session,
      idempotencyKey,
      maxAttempts,
    });

    return NextResponse.json({
      success: true,
      operationId: op.id,
      status: op.status,
      targetResource: op.target_resource,
      idempotencyKey: op.idempotency_key,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enqueue operation' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetResource = searchParams.get('targetResource') || undefined;
    const status = (searchParams.get('status') as any) || undefined;
    const limit = Number(searchParams.get('limit')) || 50;

    const operations = getOperations({ targetResource, status, limit });

    return NextResponse.json({
      success: true,
      operations: operations.map((op) => ({
        id: op.id,
        type: op.type,
        targetResource: op.target_resource,
        status: op.status,
        attemptCount: op.attempt_count,
        maxAttempts: op.max_attempts,
        createdAt: op.created_at,
        updatedAt: op.updated_at,
        nextAttemptAt: op.next_attempt_at,
        idempotencyKey: op.idempotency_key,
        errorCategory: op.error_category,
        errorMessage: op.error_message,
        result: op.result ? JSON.parse(op.result) : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch operations' },
      { status: 500 }
    );
  }
}
