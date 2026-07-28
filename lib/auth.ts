import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { SessionData } from '@/types';

const SESSION_COOKIE = 'ytm_session';
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || 'minecraftprahas@gmail.com';

export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as SessionData;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, data: SessionData): void {
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
  response.cookies.set(SESSION_COOKIE, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
  });
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      accessToken: data.access_token as string,
      expiresAt: Date.now() + (data.expires_in as number) * 1000,
    };
  } catch {
    return null;
  }
}

export function isAuthorized(email: string): boolean {
  return typeof email === 'string' && email.trim().length > 0;
}
