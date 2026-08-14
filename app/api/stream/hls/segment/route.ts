import fs from 'fs';
import { getMp3Path, isDownloaded } from '@/lib/downloader';
import { verifyAndTrackSegmentRequest } from '@/lib/sessionStreamAuth';
import { buildMp3SegmentIndex, buildTsSegmentFromMp3Chunk } from '@/lib/hlsTsMux';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('s');
  const token = searchParams.get('t');
  const seqStr = searchParams.get('seq');

  if (!sessionId || !token || seqStr === null) {
    return new Response('Missing parameters', { status: 400 });
  }

  const seq = Number(seqStr);
  if (!Number.isInteger(seq) || seq < 0) {
    return new Response('Invalid sequence index', { status: 400 });
  }

  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const verification = verifyAndTrackSegmentRequest(sessionId, token, clientIp);
  if (!verification.valid || !verification.videoId) {
    return new Response(verification.errorMessage || 'Unauthorized segment request', { status: 403 });
  }

  const videoId = verification.videoId;
  if (!isDownloaded(videoId)) {
    return new Response('Track media not found', { status: 404 });
  }

  const filePath = getMp3Path(videoId);
  const index = await buildMp3SegmentIndex(filePath);

  if (seq >= index.boundaries.length - 1) {
    return new Response(new Uint8Array(0), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': '0',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
      },
    });
  }

  const start = index.boundaries[seq];
  const end = index.boundaries[seq + 1] - 1;
  const chunkSize = end - start + 1;
  const fileBuffer = await fs.promises.readFile(filePath);
  const audioChunk = new Uint8Array(fileBuffer.subarray(start, end + 1));

  const pts = seq * Math.round(index.durations[seq] * 90000);
  const { tsSegment } = buildTsSegmentFromMp3Chunk(audioChunk, pts, { pat: 0, pmt: 0, audio: 0 }, index.streamType);

  return new Response(tsSegment, {
    headers: {
      'Content-Type': 'video/mp2t',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'Content-Length': String(tsSegment.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}
