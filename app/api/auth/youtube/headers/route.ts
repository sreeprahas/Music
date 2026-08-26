import { NextResponse } from 'next/server';
import { setupHeadersAuth } from '@/lib/youtube/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { headers?: string; authFile?: string };
    if (!body.headers) {
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
    }

    const res = await setupHeadersAuth(body.headers, body.authFile);
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to setup headers auth' },
      { status: 500 },
    );
  }
}
