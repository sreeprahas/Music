import { NextResponse } from 'next/server';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  try {
    const job = await MusicService.getTrackStatus(jobId);
    return NextResponse.json({ jobId, status: job.status, error: job.error || null });
  } catch (error) {
    console.error('[music/download/status]', error);
    const status = error instanceof MusicServiceError ? (error.status || (error.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    return NextResponse.json({ error: error instanceof MusicServiceError ? error.code : 'SPOTIFLAC_ERROR', message: error instanceof Error ? error.message : 'Status lookup failed' }, { status });
  }
}
