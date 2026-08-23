/**
 * Spotify anonymous guest-token acquisition.
 *
 * Primary path: Spotify's web-player token endpoint with TOTP parameters
 * computed from the rotated embedded secrets (see ./totp). This restores
 * anonymous access after Spotify started rejecting plain transport tokens.
 *
 * Fallbacks kept for defense in depth:
 *  - the legacy `get_access_token` endpoint (still works in some regions)
 *  - extracting a session token from the embed page (rarely present now)
 *
 * No OAuth, no client ID, no client secret, no developer app credentials.
 */

import { SpotifyGuestTokenError } from './errors';
import { generateTotpParams } from './totp';

const GUEST_TOKEN_URL =
  'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';

const WEB_PLAYER_TOKEN_URL = 'https://open.spotify.com/api/token';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://open.spotify.com/',
} as const;

export interface GuestToken {
  accessToken: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
}

function parseTokenResponse(body: Record<string, unknown>): GuestToken | null {
  const token = (body['accessToken'] ?? body['access_token']) as string | undefined;
  if (typeof token !== 'string' || !token) return null;
  const expMs =
    (body['accessTokenExpirationTimestampMs'] as number | undefined) ??
    (body['expires_in'] ? Date.now() + Number(body['expires_in']) * 1000 : Date.now() + 3600_000);
  return { accessToken: token, expiresAt: expMs };
}

/** Fetch an anonymous token from the TOTP-protected web-player endpoint. */
async function fetchWebPlayerToken(): Promise<GuestToken> {
  const { totp, totpServer, totpVer } = await generateTotpParams();
  const url =
    `${WEB_PLAYER_TOKEN_URL}?reason=init&productType=web-player` +
    `&totp=${totp}&totpServer=${totpServer}&totpVer=${totpVer}`;
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`web-player token endpoint returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const token = parseTokenResponse(body);
  if (!token) throw new Error('web-player token response missing accessToken');
  return token;
}

/** Legacy anonymous endpoint — still functional in some regions. */
async function fetchLegacyGuestToken(): Promise<GuestToken> {
  const res = await fetch(GUEST_TOKEN_URL, {
    headers: { ...BROWSER_HEADERS },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`legacy token endpoint returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const token = parseTokenResponse(body);
  if (!token) throw new Error('legacy token response missing accessToken');
  return token;
}

/**
 * Fetch a fresh anonymous guest token.
 * The token is temporary — handled server-side only, never logged or sent to client.
 */
export async function fetchGuestToken(playlistIdForFallback?: string): Promise<GuestToken> {
  // 1. TOTP-protected web-player endpoint
  try {
    return await fetchWebPlayerToken();
  } catch (err) {
    console.warn(`[Spotify Guest Token] web-player/TOTP attempt failed: ${(err as Error).message}`);
  }

  // 2. Legacy transport endpoint
  try {
    return await fetchLegacyGuestToken();
  } catch (err) {
    console.warn(`[Spotify Guest Token] legacy attempt failed: ${(err as Error).message}`);
  }

  // 3. Last resort: extract session accessToken from the embed page
  try {
    const embedId = playlistIdForFallback || '37i9dQZF1DXcBWIGoYBM5M';
    const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${embedId}`, {
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (embedRes.ok) {
      const html = await embedRes.text();
      const tokenMatch = html.match(/accessToken["':\s]+([A-Za-z0-9_-]{20,})/);
      if (tokenMatch && tokenMatch[1]) {
        return {
          accessToken: tokenMatch[1],
          expiresAt: Date.now() + 3600_000,
        };
      }
    }
  } catch (err) {
    throw new SpotifyGuestTokenError(
      `Failed to obtain Spotify guest token: ${(err as Error).message}`,
    );
  }

  throw new SpotifyGuestTokenError('Could not extract Spotify guest token from response');
}
