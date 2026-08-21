import { NextResponse } from 'next/server';
import { requestSpotifyWorker } from '@/electron/spotify/worker-client';

/**
 * GET /api/auth/spotify/status
 * Returns the current Spotify connection state.
 * Never exposes the access token or refresh token.
 */
export async function GET(): Promise<Response> {
  let spotapi = { connected: false };
  try { spotapi = await requestSpotifyWorker<{ connected: boolean }>('auth_status'); } catch { /* unavailable outside Electron */ }
  return NextResponse.json({ connected: spotapi.connected, expiresAt: null, provider: 'spotapi' });
}
