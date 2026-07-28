import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const AUTHORIZED_EMAIL = (process.env.AUTHORIZED_EMAIL || 'minecraftprahas@gmail.com').toLowerCase().trim();

export async function GET() {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ user: null });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('ytm_session');

  let user = null;
  if (sessionCookie?.value) {
    try {
      const decoded = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
      if (decoded && decoded.email) {
        user = {
          ...decoded,
          picture: decoded.picture || decoded.image || '',
          isAuthorized: true,
        };
      }
    } catch (e) {
      // Invalid cookie
    }
  }

  return NextResponse.json({
    authorizedEmail: AUTHORIZED_EMAIL,
    user,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;
    const targetEmail = (email || AUTHORIZED_EMAIL).toLowerCase().trim();

    if (targetEmail !== AUTHORIZED_EMAIL) {
      return NextResponse.json(
        {
          success: false,
          error: 'Access Denied',
          message: `Only ${AUTHORIZED_EMAIL} is authorized to authenticate with this personal YouTube Music app.`,
        },
        { status: 403 }
      );
    }

    const sessionData = {
      email: AUTHORIZED_EMAIL,
      name: 'Prahas (Owner)',
      image: 'https://yt3.ggpht.com/M_GLpOsLI6zBdKcz0zcb4lvT0576dx95VbKfy-GaEhEjWHk24543BwU6gik_xZibqShYgxcM=s108-c-k-c0x00ffffff-no-rj',
      authenticatedAt: new Date().toISOString(),
    };

    const cookieVal = Buffer.from(JSON.stringify(sessionData)).toString('base64');
    const response = NextResponse.json({
      success: true,
      user: { ...sessionData, isAuthorized: true },
    });

    response.cookies.set('ytm_session', cookieVal, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('ytm_session');
  return response;
}
