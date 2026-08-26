import { NextResponse } from 'next/server';
import { getAuthStatus } from '@/lib/youtube/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getAuthStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        authenticated: false,
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to query YouTube auth status',
      },
      { status: 500 },
    );
  }
}
