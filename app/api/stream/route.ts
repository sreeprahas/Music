import { NextResponse } from 'next/server';
import { getStreamUrl, isValidVideoId } from '@/lib/ytdlp/stream';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ streamUrl: '' });
  }

  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId') || searchParams.get('v');

    if (!videoId || !isValidVideoId(videoId)) {
      return NextResponse.json({ error: 'Missing or invalid videoId' }, { status: 400 });
    }

    // Delegate to the consolidated yt-dlp stream-resolution module.
    const { streamUrl, source } = await getStreamUrl(videoId);

    return NextResponse.json({ videoId, streamUrl, source });
  } catch (error) {
    console.error('[yt-dlp stream error]:', error);
    return NextResponse.json(
      { error: 'Failed to extract stream via yt-dlp', message: toUiMessage(error) },
      { status: 500 },
    );
  }
}
