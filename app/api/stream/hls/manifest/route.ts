import { getMp3Path, isDownloaded } from '@/lib/downloader';
import { verifyPlaybackSession } from '@/lib/sessionStreamAuth';
import { buildMp3SegmentIndex } from '@/lib/hlsTsMux';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('s');
  const token = searchParams.get('t');

  if (!sessionId || !token) {
    return new Response('Missing s or t parameter', { status: 400 });
  }

  const verification = verifyPlaybackSession(sessionId, token);
  if (!verification.valid || !verification.videoId) {
    return new Response(verification.errorMessage || 'Unauthorized', { status: 403 });
  }

  const videoId = verification.videoId;
  if (!isDownloaded(videoId)) {
    return new Response('Track media not found', { status: 404 });
  }

  const filePath = getMp3Path(videoId);
  const index = await buildMp3SegmentIndex(filePath);
  const targetDuration = Math.ceil(Math.max(...index.durations));

  let manifestText = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${targetDuration}\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n`;
  for (let i = 0; i < index.durations.length; i++) {
    manifestText += `#EXTINF:${index.durations[i].toFixed(3)},\n`;
    manifestText += `/api/stream/hls/segment?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}&seq=${i}\n`;
  }
  manifestText += '#EXT-X-ENDLIST\n';

  return new Response(manifestText, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    },
  });
}
