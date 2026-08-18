import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import type { Playlist, Track } from '@/types';
import { getThumbnailUrl } from './ytmusicFormat';

const execFileAsync = promisify(execFile);

/** Preview a playlist URL — fetch metadata only (no YouTube matching, no downloads).
 *  For Spotify: fetches the full track list via the spotdl bridge (no track cap).
 *  For YouTube: uses yt-dlp flat playlist (fast, no per-track search).
 *  Returns videoId for YouTube tracks (already available from yt-dlp).
 *  For Spotify tracks, videoId is empty — it's resolved during actual import.
 */
export async function previewPlaylistUrl(rawUrl: string): Promise<{ title: string; coverUrl?: string; tracks: { title: string; artist: string; duration?: number; videoId?: string; thumbnailUrl?: string }[]; isPublic: boolean }> {
  const url = new URL(rawUrl);
  if (!isYouTubeUrl(url) && !isSpotifyUrl(url)) throw new Error('Only public YouTube and Spotify playlist URLs are supported');

  if (isSpotifyUrl(url)) {
    // Spotify metadata is fetched via the spotdl bridge (lib/spotdl/bridge.ts),
    // which paginates past the 100-track cap and needs no user login or API key.
    const playlistId = extractSpotifyPlaylistId(rawUrl);
    if (!playlistId) throw new Error('Could not extract a Spotify playlist id from that URL');
    const { getPlaylistNoauth, getPlaylistTracksNoauth } = await import('./spotify/noauthApi');
    const { normalizePlaylist, normalizePlaylistItems } = await import('./spotify/normalize');
    const [spotifyPlaylist, items] = await Promise.all([
      getPlaylistNoauth(playlistId),
      getPlaylistTracksNoauth(playlistId),
    ]);
    const normalized = normalizePlaylist(spotifyPlaylist, rawUrl);
    const tracks = normalizePlaylistItems(items, normalized.id);
    return {
      title: normalized.title,
      isPublic: spotifyPlaylist.public !== false,
      coverUrl: normalized.thumbnailUrl || undefined,
      tracks: tracks.map((t) => ({
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        spotifyId: t.spotifyId,
      })),
    };
  }

  // YouTube — use yt-dlp flat playlist (fast, no per-track search)
  const { stdout } = await execFileAsync(getYtdlpPath(), ['--flat-playlist', '--dump-single-json', '--no-warnings', '--skip-download', rawUrl], { timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  const entries = Array.isArray(data.entries) ? data.entries : [data];
  const tracks = entries.map(asTrack).filter((track: Track | null): track is Track => Boolean(track));
  // Use the first track's thumbnail as the cover.
  const coverUrl = tracks[0]?.videoId ? getThumbnailUrl(tracks[0].videoId, tracks[0].title) : undefined;
  return {
    title: data.title || 'YouTube playlist',
    isPublic: true,
    coverUrl,
    tracks: tracks.map((track: Track) => ({
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      videoId: track.videoId,
      thumbnailUrl: track.thumbnailUrl,
    })),
  };
}

function getYtdlpPath() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) return process.env.YTDLP_PATH;
  const bundled = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(bundled) ? bundled : 'yt-dlp';
}

function isYouTubeUrl(url: URL) {
  return url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com') || url.hostname === 'youtu.be';
}

function isSpotifyUrl(url: URL) {
  return url.hostname === 'open.spotify.com' || url.hostname.endsWith('.spotify.com');
}

/** Raw track straight from yt-dlp / Spotify, with the original remote thumbnail URL intact. */
function asTrack(item: any, position: number): Track | null {
  if (!item || typeof item !== 'object') return null;
  const videoId = item.id || item.url?.match(/[?&]v=([^&]+)/)?.[1];
  const title = item.title || item.track || item.name;
  if (!videoId || !title) return null;

  // Prefer YouTube Music square artwork from lh3.googleusercontent.com.
  // yt-dlp exposes multiple thumbnails; pick the square YT Music artwork when available.
  let thumbnailUrl = '';
  if (Array.isArray(item.thumbnails)) {
    const ytMusicSquare = item.thumbnails.find((thumb: any) => {
      const url = typeof thumb === 'string' ? thumb : thumb?.url || '';
      return url.includes('lh3.googleusercontent.com') && /=w\d+-h\d+-l90-rj/.test(url);
    });
    if (ytMusicSquare) {
      thumbnailUrl = typeof ytMusicSquare === 'string' ? ytMusicSquare : ytMusicSquare.url;
    }
  }
  if (!thumbnailUrl) {
    thumbnailUrl = String(item.thumbnail || item.thumbnails?.[0]?.url || '');
  }

  return {
    videoId: String(videoId),
    title: String(title),
    artist: String(item.artist || item.uploader || item.channel || item.creator || 'Unknown artist'),
    // Keep the raw remote URL here — it will be used to download the image during import.
    thumbnailUrl,
    duration: Number(item.duration) || undefined,
    position,
  };
}

async function importWithYtDlp(url: string): Promise<{ title: string; tracks: Track[] }> {
  const { stdout } = await execFileAsync(getYtdlpPath(), ['--flat-playlist', '--dump-single-json', '--no-warnings', '--skip-download', url], { timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  const entries = Array.isArray(data.entries) ? data.entries : [data];
  const tracks = entries.map(asTrack).filter((track: Track | null): track is Track => Boolean(track)).map((track: Track, position: number) => ({ ...track, position }));
  if (!tracks.length) throw new Error('No playable tracks were found in that playlist URL');
  return { title: data.title || 'Imported playlist', tracks };
}

async function importSpotifyPage(url: string): Promise<{ title: string; tracks: Track[] }> {
  // Spotify metadata is fetched via the spotdl bridge (lib/spotdl/bridge.ts),
  // which paginates past the 100-track cap and needs no user login or API key.
  const playlistId = extractSpotifyPlaylistId(url);
  if (!playlistId) throw new Error('Could not extract a Spotify playlist id from that URL');

  const { getPlaylistNoauth, getPlaylistTracksNoauth } = await import('./spotify/noauthApi');
  const { normalizePlaylist, normalizePlaylistItems } = await import('./spotify/normalize');

  const [spotifyPlaylist, items] = await Promise.all([
    getPlaylistNoauth(playlistId),
    getPlaylistTracksNoauth(playlistId),
  ]);
  const playlist = normalizePlaylist(spotifyPlaylist, url);
  const spotifyTracks = normalizePlaylistItems(items, playlist.id);
  if (!spotifyTracks.length) {
    throw new Error('Spotify did not expose any tracks. Make sure the playlist is public.');
  }

  // Resolve each Spotify track to a YouTube video ID (with caching).
  const resolved = await batchResolveSpotifyTracks(spotifyTracks);
  if (!resolved.length) {
    throw new Error('Spotify tracks were found, but none could be matched on YouTube.');
  }
  return { title: playlist.title, tracks: resolved.map((track, position) => ({ ...track, position })) };
}

/** Resolve Spotify tracks to YouTube Music videos using parallel Innertube API searches.
 *  Direct HTTP calls to YouTube's Innertube search endpoint — no yt-dlp process spawn
 *  overhead. 50 tracks resolve in ~2s vs ~15s with yt-dlp batches.
 *
 *  Accepts normalized Track objects ({title, artist, spotifyId, duration})
 *  produced by the spotdl bridge + normalize layer. Uses the YouTube ID cache
 *  to skip re-searching known tracks.
 */
async function batchResolveSpotifyTracks(trackList: any[]): Promise<Track[]> {
  const items = trackList.map((item) => ({
    title: String(item.title || item.name || ''),
    artist: String(item.subtitle || item.artist || ''),
    duration: typeof item.duration === 'number' ? item.duration : undefined,
    spotifyId: item.spotifyId,
  }));

  // Check the YouTube ID cache first — skip searches for known tracks.
  const { getYoutubeMapping, setYoutubeMapping } = await import('./db');
  const cached: (string | null)[] = items.map((item) => {
    if (!item.spotifyId) return null;
    const mapping = getYoutubeMapping(item.spotifyId);
    return mapping?.youtubeVideoId || null;
  });

  // Fire all uncached searches in parallel — Node's fetch handles concurrency natively.
  const searchPromises = items.map((item, index) => {
    if (cached[index]) return Promise.resolve({ videoId: cached[index]!, cached: true });
    return innertubeSearch(`${item.title} ${item.artist}`).then((r) => ({ videoId: r?.videoId || '', cached: false }));
  });
  const results = await Promise.all(searchPromises);

  // Map back to Track objects with original Spotify title/artist.
  return results
    .map((result, index) => {
      if (!result?.videoId) return null;
      const item = items[index];

      // Cache the mapping for future plays.
      if (item.spotifyId && !result.cached) {
        setYoutubeMapping({
          spotifyTrackId: item.spotifyId,
          youtubeVideoId: result.videoId,
          matchedTitle: item.title,
          matchedArtist: item.artist,
          duration: item.duration,
          resolvedAt: Date.now(),
        });
      }

      return {
        videoId: result.videoId,
        title: item.title,
        artist: item.artist,
        thumbnailUrl: `https://i.ytimg.com/vi/${result.videoId}/maxresdefault.jpg`,
        duration: item.duration,
        position: index,
        spotifyId: item.spotifyId,
      } as Track;
    })
    .filter((track): track is Track => Boolean(track));
}

/** Extract a Spotify playlist ID from a URL (e.g., .../playlist/4d8UhmrP8THXld2c713REP). */
function extractSpotifyPlaylistId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
}

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEhlGC5iwTYhFYqXc4c';
const INNERTUBE_URL = `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`;

/** Search YouTube via the Innertube API and return the first video result. */
async function innertubeSearch(query: string): Promise<{ videoId: string; duration?: number } | null> {
  const body = JSON.stringify({
    context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
    query,
  });
  try {
    const res = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // @ts-ignore — Node 18+ fetch supports signal; older runtimes ignore it.
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const videoId = extractFirstVideoId(data);
    return videoId ? { videoId } : null;
  } catch {
    return null;
  }
}

/** Walk the Innertube search response and return the first videoRenderer's videoId. */
function extractFirstVideoId(data: any): string | null {
  const section = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
  if (!Array.isArray(section)) return null;
  for (const item of section) {
    if (item?.videoRenderer?.videoId) return String(item.videoRenderer.videoId);
  }
  return null;
}

/**
 * importPlaylistUrl — fetches playlist metadata only.
 * Returns raw tracks whose thumbnailUrl fields still hold the original remote YouTube URL.
 * The caller (import API route) is responsible for downloading thumbnails before persisting.
 */
export async function importPlaylistUrl(rawUrl: string): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const url = new URL(rawUrl);
  if (!isYouTubeUrl(url) && !isSpotifyUrl(url)) throw new Error('Only public YouTube and Spotify playlist URLs are supported');
  const imported = isSpotifyUrl(url) ? await importSpotifyPage(url.toString()) : await importWithYtDlp(url.toString());
  const nowIso = new Date().toISOString();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Playlist thumbnail URL — will be replaced with local API URL after download.
  const playlist: Playlist = {
    id,
    title: imported.title,
    description: `Imported from ${isSpotifyUrl(url) ? 'Spotify' : 'YouTube'}`,
    thumbnailUrl: imported.tracks[0] ? getThumbnailUrl(imported.tracks[0].videoId, imported.tracks[0].title) : '',
    trackCount: imported.tracks.length,
    importedAt: nowIso,
    createdAt: nowIso,
    sourceUrl: rawUrl,
  };

  // Tracks carry original remote thumbnailUrl so the import route can download them.
  const tracks = imported.tracks.map((track) => ({
    ...track,
    playlistId: id,
    dateAdded: track.dateAdded || nowIso,
  }));

  return { playlist, tracks };
}
