import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
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
      provider: 'YouTubeGraphQlClient',
      configured: Boolean(process.env.YOUTUBE_GRAPHQL_ENDPOINT && process.env.YOUTUBE_GRAPHQL_QUERY),
      status: 'configured',
      description: 'YouTube playback/search provider.',
      capabilities: ['search', 'playback', 'playlists'],
    },
  });
}
