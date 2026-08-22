/**
 * Spotify anonymous guest-token acquisition.
 *
 * Requests an anonymous access token from Spotify's web-player endpoint.
 * If the endpoint is blocked by CDN (e.g. HTTP 403), it extracts the active
 * session token from Spotify's embed page.
 *
 * No OAuth, no client ID, no client secret, no developer app credentials.
 */

import { SpotifyGuestTokenError } from './errors';

const GUEST_TOKEN_URL =
  'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';

export interface GuestToken {
  accessToken: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
}

/**
 * Fetch a fresh anonymous guest token.
 * The token is temporary — handled server-side only, never logged or sent to client.
 */
export async function fetchGuestToken(playlistIdForFallback?: string): Promise<GuestToken> {
  // 1. Attempt primary web-player endpoint
  try {
    const res = await fetch(GUEST_TOKEN_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://open.spotify.com/',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      const token = (body['accessToken'] ?? body['access_token']) as string | undefined;
      if (typeof token === 'string' && token) {
        const expMs =
          (body['accessTokenExpirationTimestampMs'] as number | undefined) ??
          (body['expires_in'] ? Date.now() + Number(body['expires_in']) * 1000 : Date.now() + 3600_000);
        return { accessToken: token, expiresAt: expMs };
      }
    }
  } catch {
    // Fall through to embed token fallback
  }

  // 2. Fallback: Extract session accessToken from the embed page
  try {
    const embedId = playlistIdForFallback || '37i9dQZF1DXcBWIGoYBM5M';
    const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${embedId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
