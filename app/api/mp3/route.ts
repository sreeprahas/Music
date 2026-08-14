import fs from 'fs';
import { getMp3Path, isDownloaded } from '@/lib/downloader';
import { verifyAndTrackSegmentRequest } from '@/lib/sessionStreamAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return new Response('Static stub');
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const sessionId = searchParams.get('s');
  const token = searchParams.get('t');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new Response('Invalid videoId', { status: 400 });
  }

  // Validate session token if provided (fallback path for non-HLS browsers)
  if (sessionId && token) {
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const verification = verifyAndTrackSegmentRequest(sessionId, token, clientIp);
    if (!verification.valid || verification.videoId !== videoId) {
      return new Response('Invalid or expired playback session', { status: 403 });
    }
  }

  if (!isDownloaded(videoId)) {
    return new Response('Track not found', { status: 404 });
  }

  const filePath = getMp3Path(videoId);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = request.headers.get('range');

  const headers: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
  };

  if (rangeHeader) {
    const parts = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const nodeStream = fs.createReadStream(filePath, { start, end });
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer | string) =>
          controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
        );
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() { nodeStream.destroy(); },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
      },
    });
  }

  const nodeStream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) =>
        controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
      );
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() { nodeStream.destroy(); },
  });

  return new Response(webStream, {
    headers: { ...headers, 'Content-Length': String(fileSize), 'Accept-Ranges': 'bytes' },
  });
}
