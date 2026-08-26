import { NextResponse } from 'next/server';
import { startOAuthFlow, finishOAuthFlow } from '@/lib/youtube/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await startOAuthFlow();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start OAuth device authorization' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { authFile?: string };
    const res = await finishOAuthFlow(body.authFile);
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to finish OAuth authorization' },
      { status: 500 },
    );
  }
}
