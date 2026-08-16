import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const AUTHORIZED_EMAIL = (process.env.AUTHORIZED_EMAIL || 'minecraftprahas@gmail.com').toLowerCase().trim();

export async function GET() {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ user: null });
  }

  let user = null;
  const session = await getSession();
  if (session?.email) {
    user = {
      email: session.email,
      name: session.name || session.email,
      picture: session.picture || session.image || '',
      isAuthorized: true,
    };
  }

  return NextResponse.json({
    authorizedEmail: AUTHORIZED_EMAIL,
    user,
  });
}

export async function POST(request: Request) {
  return NextResponse.json({ error: 'Use Google OAuth to authenticate.' }, { status: 405 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('ytm_session');
  return response;
}
