/**
 * POST /api/download/track
 *
 * Queues exactly one Spotify track with SpotiFLAC.
 *
 * This endpoint deliberately never accepts playlist identifiers; playlist
 * downloads go through GET /api/download?playlistId=… which is a separate
 * pipeline. The payload carries the Spotify track identity:
 *
 *   { videoId?, sourceTrackId?, title, artist, album?, duration?, thumbnailUrl?, action? }
 *
 * SpotiFLAC resolves the Spotify track and runs the configured provider chain.
 */
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TrackPayload {
  videoId?: unknown;
  sourceTrackId?: unknown;
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  duration?: unknown;
  thumbnailUrl?: unknown;
  action?: unknown;
  store?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as TrackPayload;

    if (asString(body.action) === 'delete') {
      const spotifyId = asString(body.sourceTrackId) || asString(body.videoId);
      if (!/^[A-Za-z0-9]{22}$/.test(spotifyId)) return Response.json({ success: false, error: 'Invalid Spotify track ID' }, { status: 400 });
      return new Response(JSON.stringify({ success: false, error: 'Delete the track from the configured SpotiFLAC library to preserve its authoritative cache.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 409,
      });
    }

    const spotifyId = asString(body.sourceTrackId) || asString(body.videoId);
    if (!/^[A-Za-z0-9]{22}$/.test(spotifyId)) return Response.json({ success: false, error: 'A Spotify track ID is required.' }, { status: 400 });
    const title = asString(body.title) || spotifyId;
    const existingAudio = await MusicService.resolveLocalAudio({ spotifyId, title });
    if (existingAudio) return Response.json({ success: true, ready: true, videoId: spotifyId });
    const queued = await MusicService.queueDownload(spotifyId, title, request.signal);
    const job = await MusicService.waitForDownload(queued.id);
    if (job.status.toLowerCase() === 'failed') return Response.json({ success: false, error: 'DOWNLOAD_FAILED', message: job.error || 'SpotiFLAC download failed.' }, { status: 502 });
    const audio = await MusicService.resolveLocalAudio({ spotifyId, title });
    if (!audio) return Response.json({ success: false, error: 'DOWNLOAD_FAILED', message: 'Completed file was not found in the shared audio directory.' }, { status: 502 });
    return Response.json({ success: true, ready: true, videoId: spotifyId });
  } catch (err: unknown) {
    console.error('[api/download/track]', err);
    const status = err instanceof MusicServiceError ? (err.status || (err.code === 'SPOTIFLAC_UNAVAILABLE' ? 503 : 502)) : 500;
    return Response.json({ success: false, error: err instanceof MusicServiceError ? err.code : 'DOWNLOAD_FAILED', message: err instanceof Error ? err.message : 'Track processing failed' }, { status });
  }
}
