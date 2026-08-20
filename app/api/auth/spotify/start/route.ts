import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

/**
 * GET /api/auth/spotify/start
 *
 * Initiates the Spotify Authorization Code + PKCE flow.
 *
 * - Generates a cryptographically random code_verifier and derives the
 *   S256 code_challenge from it.
 * - Stores the verifier and a random state token in httpOnly, SameSite=Lax,
 *   short-lived server-side cookies; they are never sent to the client.
 * - Redirects the browser to Spotify's authorization page.
 *
 * The redirect URI is read from SPOTIFY_REDIRECT_URI (server env only).
 * It must exactly match the URI registered in the Spotify Developer Dashboard.
 * Intended value: http://127.0.0.1:3000/api/auth/spotify/callback
 */

const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

function generateVerifier(): string {
  return randomBytes(64).toString('base64url');
}

function generateChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function GET(): Promise<Response> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'SPOTIFY_CLIENT_ID is not configured' },
      { status: 503 }
    );
  }

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!redirectUri) {
    return NextResponse.json(
      { error: 'SPOTIFY_REDIRECT_URI is not configured' },
      { status: 503 }
    );
  }

  const verifier = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state = randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SPOTIFY_SCOPES,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params}`;

  const response = NextResponse.redirect(authUrl);

  // Store PKCE verifier and state in httpOnly cookies (never readable by client JS).
  // Short expiry — 10 min is enough for the user to complete authorization.
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  };
  response.cookies.set('spotify_pkce_verifier', verifier, cookieOpts);
  response.cookies.set('spotify_pkce_state', state, cookieOpts);

  return response;
}
