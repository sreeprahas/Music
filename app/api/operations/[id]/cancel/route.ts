import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cancelOperation } from '@/lib/operationEngine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = await props.params;
    const cancelled = cancelOperation(params.id, session.email);

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Operation could not be cancelled (it may be running or already completed)' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, operationId: params.id, status: 'CANCELLED' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel operation' },
      { status: 500 }
    );
  }
}
