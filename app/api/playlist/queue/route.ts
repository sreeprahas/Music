import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOperationStats, triggerWorker } from '@/lib/operationEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  triggerWorker();
  const stats = getOperationStats();

  return NextResponse.json({
    success: true,
    pending: stats.pending,
    running: stats.running,
    retryWait: stats.retryWait,
    completed: stats.completed,
    failed: stats.failed,
  });
}
