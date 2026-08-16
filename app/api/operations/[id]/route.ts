import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOperation } from '@/lib/operationEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = await props.params;
    const op = getOperation(params.id, session.email);
    if (!op) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      operation: {
        id: op.id,
        type: op.type,
        targetResource: op.target_resource,
        status: op.status,
        attemptCount: op.attempt_count,
        maxAttempts: op.max_attempts,
        createdAt: op.created_at,
        updatedAt: op.updated_at,
        startedAt: op.started_at,
        completedAt: op.completed_at,
        nextAttemptAt: op.next_attempt_at,
        idempotencyKey: op.idempotency_key,
        errorCategory: op.error_category,
        errorMessage: op.error_message,
        result: op.result ? JSON.parse(op.result) : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch operation' },
      { status: 500 }
    );
  }
}
