import { NextResponse } from 'next/server';
import { logout } from '@/lib/youtube/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const res = await logout();
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to log out from YouTube Music' },
      { status: 500 },
    );
  }
}
