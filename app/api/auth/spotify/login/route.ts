import { NextResponse } from 'next/server';
import { requestSpotifyWorker } from '@/electron/spotify/worker-client';

export const dynamic = 'force-dynamic';

/** Loads a SpotAPI browser-cookie session into the local Electron worker. */
export async function POST(request: Request): Promise<Response> {
  let body: { identifier?: unknown; cookies?: unknown };
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      body = { identifier: form.get('identifier'), cookies: form.get('cookies') };
    } else body = await request.json();
  } catch { return NextResponse.json({ error: 'Invalid login form.' }, { status: 400 }); }
  if (typeof body.cookies === 'string') {
    const cookieText = body.cookies;
    try { body.cookies = JSON.parse(cookieText); }
    catch {
      body.cookies = Object.fromEntries(cookieText.split(';').map((part: string) => part.trim().split('=').map((value: string) => value.trim())).filter(([key, value]: string[]) => key && value));
    }
  }
  if (typeof body.identifier !== 'string' || !body.identifier.trim() || !body.cookies || typeof body.cookies !== 'object' || Array.isArray(body.cookies)) {
    return NextResponse.json({ error: 'Provide an identifier and Spotify cookie object.' }, { status: 400 });
  }
  try {
    const result = await requestSpotifyWorker<{ connected: boolean; identifier: string }>('login_session', { identifier: body.identifier.trim(), cookies: body.cookies as Record<string, unknown> });
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) return Response.redirect(new URL('/?spotify_auth=ok', request.url), 303);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.name : 'AUTH_INVALID';
    const message = error instanceof Error ? error.message : 'SpotAPI session could not be loaded.';
    return NextResponse.json({ error: message, code }, { status: code === 'AUTH_REQUIRED' ? 401 : 502 });
  }
}
