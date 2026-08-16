import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { SessionData } from '@/types';

const SESSION_COOKIE = 'ytm_session';
const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL || 'minecraftprahas@gmail.com';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || 'change-me';

function encodeSession(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeSession(value: string): SessionData | null {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionData;
}

export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    return decodeSession(raw);
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, data: SessionData): void {
  const encoded = encodeSession(data);
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
