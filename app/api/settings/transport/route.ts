import { NextResponse } from 'next/server';
import {
  SpotifyGraphQLProvider,
  YouTubeGraphQLProvider,
  MUSICGQL_VERSION,
} from '@sreeprahas/musicgql';

export const dynamic = 'force-dynamic';

export async function GET() {
  const spotify = new SpotifyGraphQLProvider();
  const youtube = new YouTubeGraphQLProvider();

  return NextResponse.json({
    mode: 'graphql-only',
    packageVersion: MUSICGQL_VERSION,
    spotify: {
      provider: 'SpotifyGraphQLProvider',
      configured: true,
      status: 'configured',
      description: 'Configured through @sreeprahas/musicgql persisted-query registry',
      capabilities: spotify.getCapabilities(),
    },
    youtube: {
      provider: 'YouTubeGraphQLProvider',
      configured: false,
      status: 'unsupported',
      description: 'Unsupported - no legitimate YouTube GraphQL contract',
      capabilities: youtube.getCapabilities(),
    },
  });
}