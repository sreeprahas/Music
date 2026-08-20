/**
 * Server-side Spotify token session.
 *
 * SINGLE-USER LOCAL DESKTOP SESSION ONLY.
 * This module stores one Spotify token set in Node.js process memory.
 * It is intentionally designed for the local single-user Electron/Next.js
 * desktop application and is NOT suitable for a multi-user hosted deployment.
 * Tokens never touch the client bundle, localStorage, or any log output.
 *
 * getSpotifyAccessToken() is the injection point consumed by SpotifyGraphQLProvider.
 * It refreshes the access token proactively when within 60 s of expiry.
 * On any refresh failure the session is cleared so the UI shows
 * "Disconnected / Reauthorization required" rather than silently using a
 * stale or expired token.
 */

import { SpotifyAuthenticationError } from '@/lib/spotify/errors';

interface SpotifyTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

let _session: SpotifyTokenSet | null = null;

export function storeSpotifyTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): void {
  _session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
}

export function clearSpotifyTokens(): void {
  _session = null;
}

export function getSpotifyAuthStatus(): {
  connected: boolean;
  expiresAt: number | null;
} {
  if (!_session) return { connected: false, expiresAt: null };
  return { connected: true, expiresAt: _session.expiresAt };
}

/**
 * Called by SpotifyGraphQLProvider.getAccessToken.
 *
 * Returns a valid access token, refreshing proactively when < 60 s from expiry.
 *
 * Failure modes — all clear the session and throw SpotifyAuthenticationError
 * so the provider surfaces a clean auth error and the UI becomes Disconnected:
 *   - SPOTIFY_CLIENT_ID is missing
 *   - Spotify token endpoint rejects the refresh token (4xx)
 *   - Network error during refresh
 */
export async function getSpotifyAccessToken(): Promise<string> {
  if (!_session) return '';

  const refreshThreshold = 60 * 1000; // 60 s
  if (_session.expiresAt - Date.now() > refreshThreshold) {
    return _session.accessToken;
  }

  // Token is near/past expiry — attempt silent refresh.
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    console.error('[spotify-session] SPOTIFY_CLIENT_ID not configured; clearing session.');
    _session = null;
    throw new SpotifyAuthenticationError(
      'Spotify reauthorization required: client is not configured.'
    );
  }

  const refreshToken = _session.refreshToken;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  let res: Response;
  try {
    res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    // Network failure — clear session; provider will surface auth error.
    console.error('[spotify-session] Token refresh network error; clearing session.');
    _session = null;
    throw new SpotifyAuthenticationError(
      'Spotify reauthorization required: could not reach token endpoint.'
    );
  }

  if (!res.ok) {
    // Spotify rejected the refresh token (e.g. revoked, expired).
    console.error('[spotify-session] Token refresh rejected (HTTP', res.status, '); clearing session.');
    _session = null;
    throw new SpotifyAuthenticationError(
      'Spotify reauthorization required: refresh token was rejected.'
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  _session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return _session.accessToken;
}
