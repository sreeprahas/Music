import { NextResponse } from 'next/server';
import { getSpotifyAuthStatus } from '@/lib/auth/spotify-session';

/**
 * GET /api/auth/spotify/status
 * Returns the current Spotify connection state.
 * Never exposes the access token or refresh token.
 */
export async function GET(): Promise<Response> {
  const { connected, expiresAt } = getSpotifyAuthStatus();
  return NextResponse.json({ connected, expiresAt });
}
