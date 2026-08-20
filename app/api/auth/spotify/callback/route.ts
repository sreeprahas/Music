import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { storeSpotifyTokens } from '@/lib/auth/spotify-session';

/**
 * GET /api/auth/spotify/callback
 *
 * Handles the Spotify PKCE authorization callback.
 *
 * Security properties:
 * - State cookie validated before any further processing (CSRF protection).
 * - Authorization code, code_verifier, and tokens are never logged.
 * - The redirect URI used for token exchange is read from SPOTIFY_REDIRECT_URI
 *   and must exactly match the URI used in the authorization request.
 * - PKCE cookies are deleted unconditionally after use (success or failure).
 */

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Unconditionally read and then schedule deletion of PKCE cookies.
  // next/headers cookies() is the canonical server-component cookie API.
  const cookieStore = await cookies();
  const storedState = cookieStore.get('spotify_pkce_state')?.value ?? null;
  const verifier = cookieStore.get('spotify_pkce_verifier')?.value ?? null;

  const baseUrl = new URL('/', url);

  const reject = (reason: string): Response => {
    console.warn(`[spotify-callback] Rejected: ${reason}`);
    const res = NextResponse.redirect(new URL(`/?spotify_auth=${reason}`, baseUrl));
    res.cookies.delete('spotify_pkce_verifier');
    res.cookies.delete('spotify_pkce_state');
    return res;
  };

  // User denied authorization on the Spotify side.
  if (error) {
    return reject('denied');
  }

  // Validate state before touching anything else (CSRF protection).
  if (!storedState || !returnedState || returnedState !== storedState) {
    return reject('state_mismatch');
  }

  if (!code) {
    return reject('invalid');
  }

  if (!verifier) {
    return reject('invalid');
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return reject('no_client_id');
  }

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!redirectUri) {
    return reject('no_redirect_uri');
  }

  // Exchange authorization code for tokens.
  // The code_verifier proves we initiated this flow (PKCE).
  // Neither the code nor the verifier are logged.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    console.error('[spotify-callback] Token exchange network error.');
    return reject('token_error');
  }

  if (!tokenRes.ok) {
    console.error('[spotify-callback] Token exchange failed. HTTP', tokenRes.status);
    return reject('token_error');
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  storeSpotifyTokens(tokens);
  console.info('[spotify-callback] Spotify connected.');

  // Success — clear PKCE cookies and redirect to app.
  const response = NextResponse.redirect(new URL('/?spotify_auth=ok', baseUrl));
  response.cookies.delete('spotify_pkce_verifier');
  response.cookies.delete('spotify_pkce_state');
  return response;
}
