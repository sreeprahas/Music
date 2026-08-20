import { NextResponse } from 'next/server';
import { resolvePlayback } from '@/lib/youtube/playback';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ streamUrl: '' });
  }

  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId') || searchParams.get('v');

    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: 'Missing or invalid videoId' }, { status: 400 });
    }

    const { streamUrl, mimeType, expiresAt } = await resolvePlayback(videoId);

    return NextResponse.json({ videoId, streamUrl, mimeType, expiresAt, source: 'graphql' });
  } catch (error) {
    console.error('[GraphQL stream error]:', error);
    return NextResponse.json(
      { error: 'Failed to resolve a GraphQL stream', message: toUiMessage(error) },
      { status: 500 },
    );
  }
}
