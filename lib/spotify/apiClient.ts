/**
 * Spotify internal playlist API client.
 *
 * Uses Spotify's internal playlist endpoint with an anonymous guest token.
 * Handles pagination until `next === null`, rate-limiting, and malformed items.
 * If the API endpoint is rate-limited, it defensively falls back to extracting
 * the full track list from the embed payload.
 *
 * No OAuth, no client ID, no client secret, no Spotify developer credentials.
 */

import { SpotifyApiError, SpotifyNotFoundError, SpotifyRateLimitError } from './errors';
import { requireSpotifyId } from './validation';

const API_BASE = 'https://api.spotify.com/v1';
const PAGE_LIMIT = 100;
/** Delay between paginated requests to reduce rate-limit risk. */
const PAGE_DELAY_MS = 400;

export interface RawSpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
  album: {
    images: Array<{ url: string; width?: number; height?: number }>;
  };
}

export interface RawSpotifyPlaylistItem {
  added_at: string | null;
  track: RawSpotifyTrack | null;
}

export interface SpotifyPage {
  items: RawSpotifyPlaylistItem[];
  next: string | null;
  total: number;
}

export interface NormalizedTrack {
  name: string;
  artists: string;
  duration_ms: number;
  image: string;
  added_at: string;
  spotifyTrackId: string;
}

export type ProgressCallback = (fetched: number, total: number) => void;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all tracks in a playlist, paginating until `next === null`.
 *
 * @param playlistId  Validated Spotify playlist ID.
 * @param accessToken Anonymous guest token (server-side only).
 * @param onProgress  Optional callback for progress reporting.
 */
export async function fetchAllPlaylistTracks(
  playlistId: string,
  accessToken: string,
  onProgress?: ProgressCallback,
): Promise<NormalizedTrack[]> {
  requireSpotifyId(playlistId);

  const result: NormalizedTrack[] = [];
  let url: string | null =
    `${API_BASE}/playlists/${playlistId}/tracks?limit=${PAGE_LIMIT}&offset=0`;
  let total = 0;
  let isFirstPage = true;
  let useFallback = false;

  while (url !== null && !useFallback) {
    if (!isFirstPage) {
      await delay(PAGE_DELAY_MS);
    }
    isFirstPage = false;

    try {
      const page = await fetchPage(url, accessToken);
      if (page.total > 0) total = page.total;

      const normalized = normalizePage(page.items);
      result.push(...normalized);

      onProgress?.(result.length, total || result.length);

      url = page.next;
    } catch (err) {
      // If the internal API is throttled or blocked, fallback to embed tracks extraction
      if (err instanceof SpotifyRateLimitError || (err as SpotifyApiError).status === 429 || (err as SpotifyApiError).status === 403) {
        useFallback = true;
        break;
      }
      throw err;
    }
  }

  // Defensive fallback: Extract all available tracks from the embed payload
  if (useFallback && result.length === 0) {
    const embedTracks = await fetchAllTracksFromEmbed(playlistId);
    result.push(...embedTracks);
    onProgress?.(result.length, result.length);
  }

  return result;
}

/** Fetch minimal playlist metadata (name + cover) via internal API or embed fallback. */
export async function fetchPlaylistMeta(
  playlistId: string,
  accessToken: string,
): Promise<{ name: string; image: string }> {
  requireSpotifyId(playlistId);

  try {
    const url = `${API_BASE}/playlists/${playlistId}?fields=name,images`;
    const res = await authorizedFetch(url, accessToken);
    const body = (await res.json()) as Record<string, unknown>;

    const name = typeof body['name'] === 'string' ? body['name'] : 'Spotify Playlist';
    const images = body['images'];
    const image =
      Array.isArray(images) && images.length > 0
        ? ((images[0] as Record<string, unknown>)?.['url'] as string) || ''
        : '';

    return { name, image };
  } catch {
    // Fallback to embed metadata
    return fetchMetaFromEmbed(playlistId);
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchPage(url: string, accessToken: string): Promise<SpotifyPage> {
  const res = await authorizedFetch(url, accessToken);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SpotifyApiError('Spotify API response is not valid JSON');
  }

  if (!body || typeof body !== 'object') {
    throw new SpotifyApiError('Unexpected Spotify API response shape');
  }

  const obj = body as Record<string, unknown>;
  const items = obj['items'];
  if (!Array.isArray(items)) {
    throw new SpotifyApiError('Spotify API response missing "items" array');
  }

  return {
    items: items as RawSpotifyPlaylistItem[],
    next: typeof obj['next'] === 'string' ? obj['next'] : null,
    total: typeof obj['total'] === 'number' ? obj['total'] : 0,
  };
}

async function authorizedFetch(url: string, accessToken: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new SpotifyApiError(`Network error fetching Spotify tracks: ${(err as Error).message}`);
  }

  if (res.status === 401) {
    throw new SpotifyApiError('Spotify guest token is expired or invalid', 401);
  }
  if (res.status === 404) {
    throw new SpotifyNotFoundError();
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') || '5');
    throw new SpotifyRateLimitError('Spotify rate limit exceeded', retryAfter * 1000);
  }
  if (!res.ok) {
    throw new SpotifyApiError(`Spotify API returned HTTP ${res.status}`, res.status);
  }

  return res;
}

// ─── Embed fallback extraction ───────────────────────────────────────────────

async function fetchAllTracksFromEmbed(playlistId: string): Promise<NormalizedTrack[]> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return [];
  const html = await res.text();
  const match = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match || !match[1]) return [];

  try {
    const data = JSON.parse(match[1]) as Record<string, unknown>;
    const trackList = findEmbedTrackList(data);
    const added_at = new Date().toISOString();

    const rawTracks = trackList.map((t) => {
      const obj = t as Record<string, unknown>;
      const inner = (obj['track'] as Record<string, unknown> | undefined) || obj;
      const name = (inner['title'] ?? inner['name'] ?? obj['title'] ?? obj['name'] ?? 'Unknown') as string;
      const artists = extractArtists(inner || obj);
      const image = extractImage(inner || obj);
      const duration_ms = (inner['duration'] ?? inner['duration_ms'] ?? obj['duration'] ?? 0) as number;
      const rawUri = (inner['uri'] ?? obj['uri'] ?? '') as string;
      const uriMatch = /^spotify:track:([A-Za-z0-9]+)$/.exec(rawUri);
      const spotifyTrackId = uriMatch ? uriMatch[1] : ((inner['id'] ?? obj['id'] ?? '') as string);

      return {
        name,
        artists,
        duration_ms,
        image,
        added_at,
        spotifyTrackId,
      };
    });

    // Scrape individual track images in parallel with bounded concurrency if image is missing
    const tasks = rawTracks.map((track) => async () => {
      if (track.image || !track.spotifyTrackId) return;
      try {
        const trackRes = await fetch(`https://open.spotify.com/embed/track/${track.spotifyTrackId}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (trackRes.ok) {
          const trackHtml = await trackRes.text();
          const trackMatch = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(trackHtml);
          if (trackMatch && trackMatch[1]) {
            const trackData = JSON.parse(trackMatch[1]) as Record<string, unknown>;
            const entity = (trackData as any)?.props?.pageProps?.state?.data?.entity;
            const viImages = entity?.visualIdentity?.image;
            if (Array.isArray(viImages) && viImages.length > 0) {
              const sorted = [...viImages].sort((a: any, b: any) => (b.maxWidth || 0) - (a.maxWidth || 0));
              track.image = sorted[0]?.url || '';
            } else {
              track.image = entity?.coverArt?.sources?.[0]?.url || '';
            }
          }
        }
      } catch {}
    });

    // Run 10 at a time
    let idx = 0;
    const runners: Promise<void>[] = [];
    for (let i = 0; i < Math.min(10, tasks.length); i++) {
      runners.push(
        (async () => {
          while (idx < tasks.length) {
            const current = tasks[idx++];
            await current();
          }
        })(),
      );
    }
    await Promise.all(runners);

    return rawTracks;
  } catch {
    return [];
  }
}

async function fetchMetaFromEmbed(playlistId: string): Promise<{ name: string; image: string }> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return { name: 'Spotify Playlist', image: '' };
  const html = await res.text();
  const match = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match || !match[1]) return { name: 'Spotify Playlist', image: '' };

  try {
    const data = JSON.parse(match[1]) as Record<string, unknown>;
    const entity = (data as any)?.props?.pageProps?.state?.data?.entity;
    const name = entity?.name || 'Spotify Playlist';
    // Spotify embed uses visualIdentity.image or coverArt.sources — not images[]
    const viImages = entity?.visualIdentity?.image;
    const image =
      (Array.isArray(viImages) && viImages.length > 0
        ? [...viImages].sort((a: any, b: any) => (b.maxWidth || 0) - (a.maxWidth || 0))[0]?.url
        : null) ??
      entity?.coverArt?.sources?.[0]?.url ??
      entity?.images?.[0]?.url ??
      '';
    return { name, image };
  } catch {
    return { name: 'Spotify Playlist', image: '' };
  }
}

function findEmbedTrackList(root: Record<string, unknown>): unknown[] {
  const knownPaths = [
    'props.pageProps.state.data.entity.trackList',
    'props.pageProps.state.data.entity.tracks.items',
    'props.pageProps.initialStoreState.entities.playlists.playlistItems',
    'props.pageProps.data.entity.trackList',
  ];
  for (const p of knownPaths) {
    let curr: any = root;
    for (const part of p.split('.')) curr = curr?.[part];
    if (Array.isArray(curr) && curr.length > 0) return curr;
  }
  return [];
}

function extractArtists(obj: Record<string, unknown>): string {
  const artists = obj['artists'];
  if (Array.isArray(artists)) {
    return artists
      .map((a) => (typeof a === 'string' ? a : (a as Record<string, unknown>)?.['name'] || ''))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof obj['subtitle'] === 'string') return obj['subtitle'];
  return '';
}

function extractImage(obj: Record<string, unknown>): string {
  const albumOfTrack = obj['albumOfTrack'] as Record<string, unknown> | undefined;
  const coverArt = albumOfTrack?.['coverArt'] as Record<string, unknown> | undefined;
  const sources = coverArt?.['sources'];
  if (Array.isArray(sources) && sources.length > 0) {
    const sorted = [...sources].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    return (sorted[0] as any)?.url || '';
  }
  return '';
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizePage(items: RawSpotifyPlaylistItem[]): NormalizedTrack[] {
  const result: NormalizedTrack[] = [];
  for (const item of items) {
    const track = safeExtract(item);
    if (track) result.push(track);
  }
  return result;
}

function safeExtract(item: unknown): NormalizedTrack | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const track = obj['track'];

  if (!track || typeof track !== 'object') return null;

  const t = track as Record<string, unknown>;
  const name = typeof t['name'] === 'string' && t['name'].trim() ? t['name'].trim() : null;
  if (!name) return null;

  const id = typeof t['id'] === 'string' ? t['id'] : '';
  const duration_ms = typeof t['duration_ms'] === 'number' ? t['duration_ms'] : 0;

  const artistsArr = t['artists'];
  const artists = Array.isArray(artistsArr)
    ? artistsArr
        .map((a) => {
          if (!a || typeof a !== 'object') return '';
          return ((a as Record<string, unknown>)['name'] as string) || '';
        })
        .filter(Boolean)
        .join(', ')
    : '';

  const albumObj = t['album'] as Record<string, unknown> | undefined;
  const images = albumObj?.['images'];
  const image = pickBestImage(images);

  const added_at =
    typeof obj['added_at'] === 'string' && obj['added_at']
      ? obj['added_at']
      : new Date().toISOString();

  return { name, artists, duration_ms, image, added_at, spotifyTrackId: id };
}

function pickBestImage(images: unknown): string {
  if (!Array.isArray(images) || images.length === 0) return '';
  const sorted = [...images].sort((a, b) => {
    const wa = (a as Record<string, unknown>)?.['width'] as number ?? 0;
    const wb = (b as Record<string, unknown>)?.['width'] as number ?? 0;
    return wb - wa;
  });
  const url = (sorted[0] as Record<string, unknown>)?.['url'];
  return typeof url === 'string' ? url : '';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
