/**
 * POST /api/download/track
 *
 * Downloads EXACTLY ONE song — the one identified by the request payload.
 *
 * This endpoint deliberately never accepts playlist identifiers; playlist
 * downloads go through GET /api/download?playlistId=… which is a separate
 * pipeline. The payload carries the song's global identity:
 *
 *   { videoId?, sourceTrackId?, title, artist, album?, duration?, thumbnailUrl?, action? }
 *
 * Spotify tracks that have not been matched to a YouTube video yet are
 * resolved here (same matching engine used by the player) so "Download song"
 * works on any song, regardless of source.
 */
import { downloadTrack, deleteTrack } from '@/lib/downloader';
import { matchSpotifyTrack } from '@/lib/matching/matcher';
import { resolveAudioStore, type AudioStore } from '@/lib/cache/audio';
import { deleteCachedAudio } from '@/lib/cache/streamCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

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

    let videoId = asString(body.videoId);
    const sourceTrackId = asString(body.sourceTrackId);
    const title = asString(body.title);
    const artist = asString(body.artist);
    const album = asString(body.album);
    const thumbnailUrl = asString(body.thumbnailUrl);
    const duration = typeof body.duration === 'number' && Number.isFinite(body.duration) ? body.duration : undefined;

    // Resolve the song's YouTube identity when the caller only knows the
    // Spotify identity. Single-song by definition: the resolved videoId is
    // used for this request only.
    if (!VIDEO_ID.test(videoId) && sourceTrackId && title) {
      try {
        const match = await matchSpotifyTrack(
          {
            id: sourceTrackId,
            title,
            artist,
            album: album || undefined,
            duration,
            thumbnailUrl: thumbnailUrl || undefined,
          },
          { signal: request.signal },
        );
        if (match.matched && match.candidate?.videoId && VIDEO_ID.test(match.candidate.videoId)) {
          videoId = match.candidate.videoId;
        }
      } catch (err) {
        console.warn('[api/download/track] Spotify resolution failed:', err instanceof Error ? err.message : err);
      }
    }

    if (!videoId || !VIDEO_ID.test(videoId)) {
      return new Response(JSON.stringify({ success: false, error: 'Missing videoId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (asString(body.action) === 'delete') {
      // store=cache removes an automatically cached song; the default removes
      // an explicit user download. The two stores are never mixed.
      const store: AudioStore = resolveAudioStore(body.store);
      const ok = store === 'cache' ? deleteCachedAudio(videoId) : deleteTrack(videoId);
      return new Response(JSON.stringify({ success: ok }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default action: download THIS single track
    await downloadTrack(videoId, title || undefined, artist || undefined, request.signal);
    return new Response(JSON.stringify({ success: true, videoId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    let message = err instanceof Error ? err.message : 'Track processing failed';
    if (message.includes('ENOTFOUND') || message.includes('fetch failed') || message.includes('Unable to download API page')) {
      message = 'Download failed: No internet connection available.';
    }
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
