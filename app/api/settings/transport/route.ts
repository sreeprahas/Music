import { NextResponse } from 'next/server';
import { SPOTIFY_PROVIDER } from '@/lib/spotify/config';
import { getSpotifyWorkerStatus } from '@/electron/spotify/worker-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  let workerStatus = 'unavailable';
  try { workerStatus = (await getSpotifyWorkerStatus()).status; } catch { /* regular Next server has no Electron bridge */ }
  return NextResponse.json({
    mode: 'provider',
    spotify: {
      provider: SPOTIFY_PROVIDER === 'spotapi' ? 'SpotAPIProvider' : SPOTIFY_PROVIDER,
      configured: workerStatus === 'ready',
      status: workerStatus,
      description: 'Local SpotAPI Python worker managed by Electron.',
      capabilities: ['search', 'track', 'artist', 'album', 'playlist', 'playlist-mutations', 'profile'],
    },
    youtube: {
      provider: 'YouTubeGraphQlClient',
      configured: Boolean(process.env.YOUTUBE_GRAPHQL_ENDPOINT && process.env.YOUTUBE_GRAPHQL_QUERY),
      status: 'configured',
      description: 'Separate YouTube playback/search provider.',
      capabilities: ['search', 'playback', 'playlists'],
    },
  });
}
