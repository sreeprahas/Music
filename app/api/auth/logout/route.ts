import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse | Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ success: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = NextResponse.redirect(`${appUrl}/`);
  clearSessionCookie(response);
  return response;
}
