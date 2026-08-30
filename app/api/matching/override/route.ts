import { NextResponse } from 'next/server';
import { setYoutubeMapping, getDb } from '@/lib/db';
import { getYouTubeInfo } from '@/lib/youtube/innertube';
import { getThumbnailUrl } from '@/lib/ytmusicFormat';
import { clearStreamUrlCache } from '@/lib/downloader';
import { deleteOldOverrideAssets, downloadYouTubeThumbnailToGlobal } from '@/lib/storage/thumbnails';
import { deleteSavedLyrics } from '@/lib/storage/lyrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractVideoId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.endsWith('youtube.com') || url.hostname.endsWith('youtube-nocookie.com')) {
      const id = url.searchParams.get('v');
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    // Bare video IDs are accepted too.
    const bare = raw.trim();
    return /^[A-Za-z0-9_-]{11}$/.test(bare) ? bare : null;
  } catch {}
  return null;
}

/**
 * POST /api/matching/override
 *
 * Manually overrides the YouTube source for a track.
 *
 * - Spotify-sourced tracks (sourceTrackId present): persisted in the
 *   spotify_youtube_map so every surface resolves through the mapping.
 * - Tracks that already carry a videoId: the tracks table row is updated
 *   directly so playback and downloads immediately use the new source.
 *
 * Side effects on a successful save:
 * - Old cached audio for the prior videoId is removed (cache store only).
 * - Old global thumbnail for the prior videoId is removed.
 * - Saved lyrics for the old artist/title are invalidated so the next
 *   lyrics fetch resolves the new song.
 * - A new global thumbnail is downloaded in the background for the new
 *   videoId so the player bar can serve it locally without YouTube CDN.
 *
 * Returns the resolved YouTube metadata (title, artist, duration, thumbnailUrl)
 * and a localThumbnailUrl that the player can use immediately, for the new
 * videoId so the caller can update all surfaces in one shot.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      spotifyTrackId?: unknown;
      sourceTrackId?: unknown;
      videoId?: unknown;
      oldVideoId?: unknown;
      oldArtist?: unknown;
      oldTitle?: unknown;
      youtubeUrl?: unknown;
      title?: unknown;
      artist?: unknown;
      duration?: unknown;
    };
    const youtubeUrl = typeof body.youtubeUrl === 'string' ? body.youtubeUrl.trim() : '';
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return NextResponse.json({ error: 'Provide a valid YouTube video link.' }, { status: 400 });
    }

    // Fetch YouTube metadata for the new videoId so all surfaces update at once.
    let ytMeta: { title?: string; artist?: string; duration?: number } = {};
    try {
      const info = await getYouTubeInfo(videoId);
      if (info?.videoDetails) {
        ytMeta = {
          title: (info.videoDetails.title || '').trim(),
          artist: (info.videoDetails.author || '').trim(),
          duration: info.videoDetails.lengthSeconds
            ? Number(info.videoDetails.lengthSeconds)
            : undefined,
        };
      }
    } catch {
      // Non-fatal — still save the mapping with partial metadata.
    }

    const sourceTrackId =
      typeof body.sourceTrackId === 'string' && body.sourceTrackId.trim()
        ? body.sourceTrackId.trim()
        : typeof body.spotifyTrackId === 'string' && body.spotifyTrackId.trim()
          ? body.spotifyTrackId.trim()
          : '';

    // Old asset cleanup inputs — defaults fall back to the incoming track
    // metadata so direct videoId overrides still clean up after themselves.
    const incomingTitle = typeof body.title === 'string' ? body.title.trim() : '';
    const incomingArtist = typeof body.artist === 'string' ? body.artist.trim() : '';
    const oldVideoIdRaw = typeof body.oldVideoId === 'string' ? body.oldVideoId.trim() : '';
    const oldVideoId = /^[A-Za-z0-9_-]{11}$/.test(oldVideoIdRaw) ? oldVideoIdRaw : '';
    const oldArtist = typeof body.oldArtist === 'string' ? body.oldArtist.trim() : incomingArtist;
    const oldTitle = typeof body.oldTitle === 'string' ? body.oldTitle.trim() : incomingTitle;

    const thumbnailUrl = getThumbnailUrl(videoId, ytMeta.title);
    // Local API URL — served from the global thumbnail dir (preferred over
    // YouTube CDN so the player bar / OS artwork never go online).
    const localThumbnailUrl = `/api/thumbnail?v=${encodeURIComponent(videoId)}`;

    if (sourceTrackId) {
      setYoutubeMapping({
        spotifyTrackId: sourceTrackId,
        youtubeVideoId: videoId,
        matchedTitle: ytMeta.title || (typeof body.title === 'string' ? body.title : undefined),
        matchedArtist: ytMeta.artist || (typeof body.artist === 'string' ? body.artist : undefined),
        duration: ytMeta.duration || (typeof body.duration === 'number' ? body.duration : undefined),
        resolvedAt: Date.now(),
        matchMethod: 'manual_override',
      });
      // Drop any cached direct stream URL so the next playback re-resolves
      // the new videoId instead of reusing a URL tied to the old source.
      clearStreamUrlCache();

      // Old-asset cleanup: only run when the videoId actually changed.
      if (oldVideoId && oldVideoId !== videoId) {
        try {
          deleteOldOverrideAssets(oldVideoId, sourceTrackId);
        } catch { /* best-effort cleanup */ }
        if (oldArtist && oldTitle) {
          try {
            deleteSavedLyrics(oldArtist, oldTitle);
          } catch { /* best-effort cleanup */ }
        }
      }

      // Background thumbnail download so the next render of the player bar
      // resolves the new local file instead of falling back to a placeholder.
      void downloadYouTubeThumbnailToGlobal(videoId).catch(() => { /* best-effort */ });

      return NextResponse.json({
        success: true,
        videoId,
        title: ytMeta.title,
        artist: ytMeta.artist,
        duration: ytMeta.duration,
        thumbnailUrl,
        localThumbnailUrl,
      });
    }

    // Direct videoId override: update the tracks table row.
    const currentVideoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
    if (!currentVideoId || !/^[A-Za-z0-9_-]{11}$/.test(currentVideoId)) {
      return NextResponse.json({ error: 'Track is missing a valid video id.' }, { status: 400 });
    }

    const db = getDb();
    const result = db
      .prepare('UPDATE tracks SET video_id = ? WHERE video_id = ?')
      .run(videoId, currentVideoId);

    if (Number(result.changes) === 0) {
      return NextResponse.json({ error: 'Track not found in the library.' }, { status: 404 });
    }

    // Old-asset cleanup for direct videoId overrides. Prefer the explicit
    // `oldVideoId` from the body, but fall back to the prior `videoId` from
    // the row update when the caller didn't provide one.
    const priorVideoId = oldVideoId && oldVideoId !== videoId
      ? oldVideoId
      : currentVideoId !== videoId
        ? currentVideoId
        : '';
    if (priorVideoId) {
      try {
        deleteOldOverrideAssets(priorVideoId);
      } catch { /* best-effort cleanup */ }
      if (incomingArtist && incomingTitle) {
        try {
          deleteSavedLyrics(incomingArtist, incomingTitle);
        } catch { /* best-effort cleanup */ }
      }
    }

    void downloadYouTubeThumbnailToGlobal(videoId).catch(() => { /* best-effort */ });

    return NextResponse.json({
      success: true,
      videoId,
      title: ytMeta.title,
      artist: ytMeta.artist,
      duration: ytMeta.duration,
      thumbnailUrl,
      localThumbnailUrl,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save YouTube override' }, { status: 500 });
  }
}
