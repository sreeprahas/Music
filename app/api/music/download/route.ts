import { NextResponse } from 'next/server';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { spotifyId?: unknown; url?: unknown; title?: unknown };
    const identifier = typeof body.url === 'string' ? body.url : typeof body.spotifyId === 'string' ? body.spotifyId : '';
    if (!identifier) return NextResponse.json({ error: 'INVALID_SPOTIFY_URL' }, { status: 400 });
    const title = typeof body.title === 'string' ? body.title : '';
    if (!title) return NextResponse.json({ error: 'TRACK_NOT_FOUND', message: 'Track title is required.' }, { status: 400 });
    const existingAudio = await MusicService.resolveLocalAudio({ spotifyId: identifier, title });
    if (existingAudio) return NextResponse.json({ ready: true, status: 'ready' });
    const queued = await MusicService.queueDownload(identifier, title);
    const job = await MusicService.waitForDownload(queued.id);
    if (job.status.toLowerCase() === 'failed') return NextResponse.json({ ready: false, status: 'failed', error: job.error || 'SpotiFLAC download failed.' }, { status: 502 });
    const audio = await MusicService.resolveLocalAudio({ spotifyId: identifier, title });
    if (!audio) return NextResponse.json({ ready: false, status: 'failed', error: 'Completed file was not found in the shared audio directory.' }, { status: 502 });
    return NextResponse.json({ ready: true, status: 'ready' }, { status: 200 });
  } catch (error) {
    console.error('[music/download]', error);
    const status = error instanceof MusicServiceError ? (error.status || (error.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    return NextResponse.json({ error: error instanceof MusicServiceError ? error.code : 'DOWNLOAD_FAILED', message: error instanceof Error ? error.message : 'Download failed' }, { status });
  }
}
