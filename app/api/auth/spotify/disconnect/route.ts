import { NextResponse } from 'next/server';
import { clearSpotifyTokens } from '@/lib/auth/spotify-session';

/**
 * POST /api/auth/spotify/disconnect
 * Clears the server-side Spotify token session.
 */
export async function POST(): Promise<Response> {
  clearSpotifyTokens();
  return NextResponse.json({ disconnected: true });
}
