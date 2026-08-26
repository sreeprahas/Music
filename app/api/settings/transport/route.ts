import { NextResponse } from 'next/server';
import { youtubeSidecar } from '@/lib/youtube/sidecar-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await youtubeSidecar.getStatus();

  return NextResponse.json({
    mode: 'youtube',
    spotify: {
      provider: 'SpotifyEmbedGuestProvider',
      configured: true,
      status: 'ready',
      description: 'Spotify playlist import via embed preview & anonymous guest token.',
      capabilities: ['playlist-preview', 'playlist-import'],
    },
    youtube: {
      provider: 'YTMusicPythonSidecar',
      configured: true,
      status: status.status,
      authenticated: status.authenticated,
      version: status.version,
      authFile: status.authFile,
      description: 'YouTube Music persistent Python sidecar using ytmusicapi.',
      capabilities: ['search', 'playback', 'playlists', 'auth', 'matching'],
    },
  });
}
