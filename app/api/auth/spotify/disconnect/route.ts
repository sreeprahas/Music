import { NextResponse } from 'next/server';
import { requestSpotifyWorker } from '@/electron/spotify/worker-client';

/**
 * POST /api/auth/spotify/disconnect
 * Clears the server-side Spotify token session.
 */
export async function POST(): Promise<Response> {
  try { await requestSpotifyWorker('logout'); } catch { /* already disconnected or outside Electron */ }
  return NextResponse.json({ disconnected: true });
}
