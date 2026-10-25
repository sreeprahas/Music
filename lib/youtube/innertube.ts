import { Innertube, UniversalCache } from 'youtubei.js';
import { log, logWarn } from '../log';

let youtubePromise: Promise<Innertube> | null = null;

export async function getYouTube(poToken?: string): Promise<Innertube> {
  if (!youtubePromise) {
    youtubePromise = Innertube.create({
      lang: 'en',
      location: 'US',
      generate_session_locally: true,
      enable_session_cache: true,
      cache: new UniversalCache(true),
      ...(poToken ? { po_token: poToken } : {}),
    }).catch((error) => {
      youtubePromise = null;
      throw error;
    });
  }
  return youtubePromise;
}

export interface YouTubeSearchItem {
  videoId: string;
  title: string;
  artist: string;
  duration?: number;
  thumbnailUrl: string;
}

function text(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.simpleText === 'string') return obj.simpleText;
    if (Array.isArray(obj.runs)) {
      return obj.runs
        .map((run) => (run && typeof run === 'object' && typeof (run as Record<string, unknown>).text === 'string'
          ? (run as Record<string, unknown>).text as string
          : ''))
        .join('');
    }
  }
  return '';
}

function parseDuration(value: unknown): number | undefined {
  const raw = text(value).trim();
  if (!raw) return undefined;
  const parts = raw.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function thumbnailFrom(video: any, videoId: string): string {
  const thumbnails = video?.thumbnails ?? video?.thumbnail?.thumbnails ?? [];
  if (Array.isArray(thumbnails) && thumbnails.length) {
    const last = thumbnails[thumbnails.length - 1];
    if (typeof last?.url === 'string') return last.url;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function artistFrom(video: any): string {
  const author = video?.author?.name ?? video?.author?.text ?? video?.owner?.name;
  if (typeof author === 'string' && author.trim()) return author.trim();
  if (Array.isArray(video?.artists)) {
    const names = video.artists
      .map((artist: any) => text(artist?.name ?? artist).trim())
      .filter(Boolean);
    if (names.length) return names.join(', ');
  }
  return text(video?.artist ?? video?.channel).trim();
}

/**
 * Normalizes the raw YouTube Music song items (MusicResponsiveListItem shapes)
 * shared by every search surface.
 */
function parseSongItems(rawSongs: unknown[]): YouTubeSearchItem[] {
  const output: YouTubeSearchItem[] = [];

  for (const song of rawSongs) {
    const videoId = (song as any)?.id ?? (song as any)?.video_id ?? (song as any)?.endpoint?.payload?.videoId;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;

    const title = text((song as any)?.title ?? (song as any)?.name).trim();
    if (!title) continue;

    const artistNames = Array.isArray((song as any)?.artists)
      ? (song as any).artists
          .map((artist: any) => text(artist?.name ?? artist).trim())
          .filter(Boolean)
      : [];

    const artist = artistNames.join(', ') || artistFrom(song) || 'Unknown Artist';

    const thumbnailUrl = thumbnailFrom(song, videoId);
    const duration =
      parseDuration((song as any)?.duration) ??
      parseDuration((song as any)?.duration_text) ??
      parseDuration((song as any)?.length_text);

    output.push({ videoId, title, artist, duration, thumbnailUrl });
  }

  return output;
}

/**
 * YouTube Music song search — deliberately Music-only.
 * Generic YouTube search is never used for matching.
 */
export async function searchYouTubeMusic(
  query: string,
  signal?: AbortSignal,
): Promise<YouTubeSearchItem[]> {
  if (signal?.aborted) throw new Error('Search cancelled');

  const youtube = await getYouTube();
  if (signal?.aborted) throw new Error('Search cancelled');

  const result: any = await youtube.music.search(query.trim(), { type: 'song' });
  if (signal?.aborted) throw new Error('Search cancelled');

  const rawSongs: any[] = Array.isArray(result?.songs?.contents)
    ? result.songs.contents
    : Array.isArray(result?.songs)
      ? result.songs
      : [];

  return parseSongItems(rawSongs);
}

export interface YouTubeArtistResolution {
  /** Canonical artist name when one could be resolved, otherwise null. */
  artistName: string | null;
  artistId: string | null;
  /** Songs by the resolved artist (may be empty when no artist matched). */
  items: YouTubeSearchItem[];
}

/**
 * Artist search on YouTube Music.
 *
 * 1. Runs the YT Music ARTISTS filter, which handles partial artist names
 *    ("Emin" → Eminem) and returns the canonical artist.
 * 2. Pulls that artist's song shelf via the artist page browse.
 * 3. Returns an empty item list when no artist can be resolved so callers can
 *    fall back to a ranked song search — ordinary title queries keep working.
 */
export async function searchYouTubeArtists(
  query: string,
  signal?: AbortSignal,
): Promise<YouTubeArtistResolution> {
  if (signal?.aborted) throw new Error('Search cancelled');

  const youtube = await getYouTube();
  if (signal?.aborted) throw new Error('Search cancelled');

  const trimmed = query.trim();

  try {
    const result: any = await youtube.music.search(trimmed, { type: 'artist' });
    if (signal?.aborted) throw new Error('Search cancelled');

    const rawArtists: any[] = Array.isArray(result?.artists?.contents)
      ? result.artists.contents
      : Array.isArray(result?.artists)
        ? result.artists
        : [];

    const top = rawArtists[0];
    const artistId =
      (typeof top?.id === 'string' && top.id) ||
      (typeof top?.browseId === 'string' && top.browseId) ||
      (typeof top?.endpoint?.payload?.browseId === 'string' && top.endpoint.payload.browseId) ||
      null;
    const artistName = text(top?.title ?? top?.name).trim() || null;

    if (!artistId) {
      return { artistName, artistId: null, items: [] };
    }

    const artist: any = await youtube.music.getArtist(artistId);
    if (signal?.aborted) throw new Error('Search cancelled');

    // The artist page exposes songs through its shelves ("Songs" / "Top songs").
    const sections: any[] = Array.isArray(artist?.sections) ? artist.sections : [];
    const songShelf = sections.find((shelf) => {
      const shelfTitle = text(shelf?.title).toLowerCase();
      if (!shelfTitle) return false;
      return shelfTitle.includes('song') || shelfTitle.includes('track');
    });

    let items = parseSongItems(Array.isArray(songShelf?.contents) ? songShelf.contents : []);

    if (items.length === 0 && typeof artist?.getAllSongs === 'function') {
      const allSongs = await artist.getAllSongs();
      items = parseSongItems(Array.isArray(allSongs?.contents) ? allSongs.contents : []);
    }

    return { artistName, artistId, items };
  } catch (err) {
    if (signal?.aborted) throw err instanceof Error ? err : new Error('Search cancelled');
    console.warn('[innertube] artist search failed, falling back to song search:', err instanceof Error ? err.message : err);
    return { artistName: null, artistId: null, items: [] };
  }
}

export async function getYouTubeInfo(
  videoId: string,
  signal?: AbortSignal,
): Promise<any> {
  if (signal?.aborted) throw new Error('Request cancelled');
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID');
  const youtube = await getYouTube();
  if (signal?.aborted) throw new Error('Request cancelled');
  return youtube.getInfo(videoId);
}

export async function getYouTubeAudioStream(
  videoId: string,
  signal?: AbortSignal,
): Promise<{ url: string; mimeType?: string; bitrate?: number; expiresAt?: number }> {
  const info: any = await getYouTubeInfo(videoId, signal);

  if (signal?.aborted) throw new Error('Request cancelled');

  /*
   * IMPORTANT:
   * Do not inspect streaming_data[].url directly.
   * youtubei.js 17.x represents some formats with cipher/signature
   * information. Format.decipher() is the library's intended
   * URL-resolution interface.
   */
  const audioFormats = (info.streaming_data?.adaptive_formats ?? [])
    .filter((format: any) => {
      const mime = format?.mime_type ?? '';
      return format?.has_audio === true || (typeof mime === 'string' && mime.startsWith('audio/'));
    });

  if (!audioFormats.length) throw new Error('No audio formats were returned by YouTube');

  // Prefer Opus 251 when available; otherwise the highest-bitrate audio format.
  audioFormats.sort((a: any, b: any) => {
    const aItag = Number(a?.itag ?? 0);
    const bItag = Number(b?.itag ?? 0);
    if (aItag === 251 && bItag !== 251) return -1;
    if (bItag === 251 && aItag !== 251) return 1;
    return Number(b?.bitrate ?? 0) - Number(a?.bitrate ?? 0);
  });

  const selected = audioFormats[0];
  const url = await selected.decipher(info.actions.session.player);

  if (typeof url !== 'string' || !url) {
    throw new Error('youtubei.js could not resolve the audio URL');
  }

  let expiresAt: number | undefined;
  try {
    const expire = Number(new URL(url).searchParams.get('expire'));
    if (Number.isFinite(expire) && expire > 0) expiresAt = expire * 1000;
  } catch { /* keep undefined */ }

  return {
    url,
    mimeType: selected?.mime_type,
    bitrate: Number(selected?.bitrate ?? 0) || undefined,
    expiresAt,
  };
}

/**
 * Resolved audio stream info used by the live-streaming path.
 * Keys are aligned with the existing /api/stream/live contract so the route
 * can forward content-type / content-length / expiry to the client.
 */
export interface StreamInfo {
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: number;
  /** Unix ms. YouTube's `expire` query param is the actual TTL. */
  expiresAt: number;
}

/**
 * Resolves a direct audio stream URL via the WEB InnerTube client.
 *
 * Used by the live-streaming hot path (lib/downloader.ts → resolveStreamUrl).
 * Replaces the previous yt-dlp subprocess: no external process spawn, no
 * ffmpeg, no media conversion. The returned URL is a direct YouTube media
 * CDN URL that the existing range-proxy can tee straight to the client and
 * to the cache store.
 */
export async function getStreamInfo(
  videoId: string,
  signal?: AbortSignal,
  poToken?: string,
): Promise<StreamInfo> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('Invalid YouTube video ID');
  }
  if (signal?.aborted) throw new Error('Request cancelled');

  const youtube = await getYouTube(poToken);
  if (signal?.aborted) throw new Error('Request cancelled');

  /*
   * YouTube no longer ships decipherable URLs in the WEB client's
   * `streaming_data.adaptive_formats` — `url`, `signature_cipher`, and
   * `cipher` are all empty strings. The audible formats still arrive, but
   * `Player.decipher()` then throws "No valid URL to decipher".
   *
   * Workaround: try multiple InnerTube clients and pick the first one
   * whose audio formats carry a directly usable URL or a decipherable
   * `signature_cipher`. Order favours clients that work without
   * sign-in / playback restrictions.
   *
   *   IOS    — returns plain `url` on audio formats, no decipher needed.
   *   MWEB   — returns `signature_cipher` on all audio formats; works
   *            through `Player.decipher()`.
   *   ANDROID — sometimes returns `url` directly (region dependent).
   *   WEB    — kept last as a baseline; currently no decipherable URL.
   */
  const CLIENTS_TO_TRY = ['IOS', 'MWEB', 'ANDROID', 'WEB'] as const;

  let selected: any | null = null;
  let player: any = null;
  let lastClientError: unknown = null;

  for (const clientName of CLIENTS_TO_TRY) {
    if (signal?.aborted) throw new Error('Request cancelled');

    try {
      const info: any = await youtube.getBasicInfo(videoId, { client: clientName });
      if (signal?.aborted) throw new Error('Request cancelled');

      const status = info?.playability_status?.status;
      if (status && status !== 'OK') {
        logWarn('[getStreamInfo] client=' + clientName + ' playability=' + status + ', trying next');
        continue;
      }

      const audioFormats = (info.streaming_data?.adaptive_formats ?? [])
        .filter((f: any) => f?.has_audio === true || (typeof f?.mime_type === 'string' && f.mime_type.startsWith('audio/')))
        .filter((f: any) => !f?.has_video);

      if (!audioFormats.length) {
        logWarn('[getStreamInfo] client=' + clientName + ' returned no audio-only formats, trying next');
        continue;
      }

      // Prefer Opus 251 (transparent, smaller), then highest bitrate.
      audioFormats.sort((a: any, b: any) => {
        const aItag = Number(a?.itag ?? 0) === 251 ? 1 : 0;
        const bItag = Number(b?.itag ?? 0) === 251 ? 1 : 0;
        if (aItag !== bItag) return bItag - aItag;
        return Number(b?.bitrate ?? 0) - Number(a?.bitrate ?? 0);
      });

      const candidate = audioFormats[0];
      const hasUrl = typeof candidate?.url === 'string' && candidate.url.length > 0;
      const hasSig = typeof candidate?.signature_cipher === 'string' && candidate.signature_cipher.length > 0;
      const hasCipher = typeof candidate?.cipher === 'string' && candidate.cipher.length > 0;

      if (!hasUrl && !hasSig && !hasCipher) {
        logWarn('[getStreamInfo] client=' + clientName + ' itag=' + candidate?.itag + ' has no decipherable URL, trying next');
        continue;
      }

      selected = candidate;
      player = youtube.session.player;
      log('[getStreamInfo] selected client=' + clientName + ' itag=' + selected?.itag + ' mime=' + selected?.mime_type + ' hasUrl=' + hasUrl + ' hasSig=' + hasSig + ' hasCipher=' + hasCipher);
      break;
    } catch (err) {
      lastClientError = err;
      logWarn('[getStreamInfo] client=' + clientName + ' failed: ' + (err instanceof Error ? err.message : err));
    }
  }

  if (!selected || !player) {
    throw new Error(
      'No audio formats were returned by YouTube'
        + (lastClientError ? ` (last error: ${lastClientError instanceof Error ? lastClientError.message : lastClientError})` : ''),
    );
  }

  const url = await selected.decipher(player);

  if (typeof url !== 'string' || !url) {
    throw new Error('youtubei.js could not resolve the audio URL');
  }

  // YouTube URLs include `expire` (Unix seconds). Use it as the real TTL;
  // fall back to a conservative 20-minute window if the param is missing.
  let expiresAt = Date.now() + 20 * 60 * 1000;
  try {
    const expire = Number(new URL(url).searchParams.get('expire'));
    if (Number.isFinite(expire) && expire > 0) {
      expiresAt = expire * 1000;
    }
  } catch { /* keep fallback */ }

  return {
    url,
    mimeType: selected?.mime_type ?? 'audio/webm',
    bitrate: Number(selected?.bitrate ?? 0),
    contentLength: selected?.content_length ? Number(selected.content_length) : undefined,
    expiresAt,
  };
}