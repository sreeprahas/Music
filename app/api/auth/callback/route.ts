import { NextResponse } from 'next/server';
import { setSessionCookie, isAuthorized } from '@/lib/auth';
import { getUserProfile } from '@/lib/ytmusicApi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse | Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ success: true });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error || !code) {
    console.error('[auth/callback] Authentication failed or code missing:', { error, code });
    return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error('[auth/callback] Token exchange failed:', errBody);
    return NextResponse.redirect(`${appUrl}/?error=token_failed`);
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokens as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  let profile;
  try {
    profile = await getUserProfile(access_token);
  } catch {
    return NextResponse.redirect(`${appUrl}/?error=profile_failed`);
  }

  if (!isAuthorized(profile.email)) {
    return NextResponse.redirect(`${appUrl}/?error=unauthorized`);
  }

  const response = NextResponse.redirect(`${appUrl}/`);
  setSessionCookie(response, {
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    accessToken: access_token,
    refreshToken: refresh_token || '',
    expiresAt: Date.now() + expires_in * 1000,
  });
  return response;
}
