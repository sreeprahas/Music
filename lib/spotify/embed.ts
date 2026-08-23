/**
 * Phase 1 — Spotify embed preview.
 *
 * Fetches the public Spotify embed page for a playlist and extracts
 * the first 10 tracks with scraped individual album artwork from Spotify.
 *
 * No metadata is saved to cache after preview.
 *
 * No OAuth, no client credentials, no official Spotify Web API.
 */

import { SpotifyEmbedError, SpotifyNotFoundError } from './errors';
import { requireSpotifyId } from './validation';

export interface EmbedPreviewTrack {
  id?: string;
  name: string;
  /** Highest-resolution album art URL available, or empty string. */
  image: string;
  /** Artist display string, e.g. "Artist A, Artist B". */
  artists: string;
  duration_ms?: number;
}

export interface EmbedPreviewResult {
  playlistName: string;
  coverImage: string;
  tracks: EmbedPreviewTrack[];
  totalTracks: number;
}

const EMBED_BASE = 'https://open.spotify.com/embed/playlist/';

/** Fetch the public embed page and return the first ≤10 tracks with scraped individual artwork. */
export async function fetchEmbedPreview(playlistId: string): Promise<EmbedPreviewResult> {
  requireSpotifyId(playlistId);

  const url = `${EMBED_BASE}${playlistId}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 404) throw new SpotifyNotFoundError('Spotify playlist not found or is private');
    if (!res.ok) throw new SpotifyEmbedError(`Spotify embed returned HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    if (err instanceof SpotifyNotFoundError || err instanceof SpotifyEmbedError) throw err;
    throw new SpotifyEmbedError(`Failed to reach Spotify embed: ${(err as Error).message}`);
  }

  const payload = extractNextData(html);
  const result = parsePayload(payload, playlistId);

  // Scrape individual album artwork for each preview song
  await scrapeIndividualTrackImages(result.tracks, result.coverImage);

  return result;
}

// ─── Individual track artwork scraper ─────────────────────────────────────────

async function scrapeIndividualTrackImages(tracks: EmbedPreviewTrack[], defaultCover: string): Promise<void> {
  const tasks = tracks.map(async (track) => {
    if (!track.id) {
      if (!track.image) track.image = defaultCover;
      return;
    }

    try {
      const res = await fetch(`https://open.spotify.com/embed/track/${track.id}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(8_000),
      });

      if (res.ok) {
        const html = await res.text();
        const match = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
        if (match && match[1]) {
          const data = JSON.parse(match[1]) as Record<string, unknown>;
          const entity = (data as any)?.props?.pageProps?.state?.data?.entity;
          const img = extractCoverFromEntity(entity);
          if (img) {
            track.image = img;
            return;
          }
        }
      }
    } catch {
      // Best-effort image scraping
    }

    // Fallback to playlist cover only if individual scrape returned nothing
    if (!track.image) {
      track.image = defaultCover;
    }
  });

  await Promise.allSettled(tasks);
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

function extractNextData(html: string): unknown {
  const match = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match || !match[1]) {
    throw new SpotifyEmbedError(
      'Could not locate __NEXT_DATA__ script in Spotify embed response. Spotify may have changed its embed structure.',
    );
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new SpotifyEmbedError('Failed to parse __NEXT_DATA__ JSON from Spotify embed');
  }
}

// ─── Payload parsing (defensive, structure-agnostic) ─────────────────────────

function parsePayload(payload: unknown, playlistId: string): EmbedPreviewResult {
  if (!payload || typeof payload !== 'object') {
    throw new SpotifyEmbedError('Spotify embed __NEXT_DATA__ is not a JSON object');
  }

  const trackItems = findTrackItems(payload as Record<string, unknown>);

  if (!trackItems.length) {
    throw new SpotifyEmbedError(
      `No tracks found in Spotify embed response for playlist ${playlistId}. The embed structure may have changed.`,
    );
  }

  const playlistName = findPlaylistName(payload as Record<string, unknown>) || 'Spotify Playlist';
  const coverImage = findPlaylistCover(payload as Record<string, unknown>) || '';

  const tracks: EmbedPreviewTrack[] = trackItems.slice(0, 10).map(normalizeEmbedTrack);
  const totalTracks = findTotalTrackCount(payload as Record<string, unknown>, trackItems.length);

  return { playlistName, coverImage, tracks, totalTracks };
}

function findTrackItems(root: Record<string, unknown>): unknown[] {
  const knownPaths = [
    'props.pageProps.state.data.entity.trackList',
    'props.pageProps.state.data.entity.tracks.items',
    'props.pageProps.initialStoreState.entities.playlists.playlistItems',
    'props.pageProps.data.entity.trackList',
    'props.pageProps.data.entity.tracks.items',
  ];

  for (const path of knownPaths) {
    const value = getPath(root, path);
    if (Array.isArray(value) && value.length > 0) return value;
  }

  return findTrackArrayInTree(root) || [];
}

function findTotalTrackCount(root: Record<string, unknown>, fallback: number): number {
  let best = fallback;
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 12) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const object = value as Record<string, unknown>;
    const hasTrackItems = Array.isArray(object.items) || Array.isArray(object.trackList) ||
      (object.items && typeof object.items === 'object');
    for (const key of ['totalCount', 'trackCount', 'totalTracks', 'total']) {
      const count = Number(object[key]);
      if (hasTrackItems && Number.isFinite(count) && count >= best) best = count;
    }
    for (const child of Object.values(object)) visit(child, depth + 1);
  };
  visit(root, 0);
  return Math.max(fallback, Math.floor(best));
}

function getPath(obj: unknown, dotPath: string): unknown {
  let current: unknown = obj;
  for (const part of dotPath.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function findTrackArrayInTree(node: unknown): unknown[] | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    if (looksLikeTrackArray(node)) return node;
    for (const item of node) {
      const found = findTrackArrayInTree(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const found = findTrackArrayInTree(obj[key]);
    if (found) return found;
  }
  return null;
}

function looksLikeTrackArray(arr: unknown[]): boolean {
  if (arr.length === 0) return false;
  const sample = arr[0];
  if (!sample || typeof sample !== 'object') return false;
  const obj = sample as Record<string, unknown>;
  return (
    (typeof obj['uid'] === 'string' || typeof obj['id'] === 'string') &&
    (typeof obj['title'] === 'string' ||
      typeof obj['name'] === 'string' ||
      Boolean(obj['track'] && typeof (obj['track'] as Record<string, unknown>)?.['name'] === 'string'))
  );
}

function normalizeEmbedTrack(raw: unknown): EmbedPreviewTrack {
  const obj = (raw as Record<string, unknown>) || {};
  const inner = (obj['track'] as Record<string, unknown> | undefined) || obj;

  const name =
    (inner['title'] as string) ||
    (inner['name'] as string) ||
    (obj['title'] as string) ||
    (obj['name'] as string) ||
    'Unknown';

  const artists = extractEmbedArtists(inner || obj);
  const image = extractEmbedImage(inner || obj);
  const duration_ms =
    (inner['duration'] as number | undefined) ??
    (inner['duration_ms'] as number | undefined) ??
    (obj['duration'] as number | undefined);

  const uri = (inner['uri'] || obj['uri'] || '') as string;
  const uriId = uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : '';
  const id = uriId || (inner['id'] as string) || (obj['id'] as string) || (obj['uid'] as string) || '';

  return { id, name, artists, image, duration_ms };
}

function extractEmbedArtists(obj: Record<string, unknown>): string {
  const artists = obj['artists'];
  if (Array.isArray(artists)) {
    return artists
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object') return (a as Record<string, unknown>)['name'] as string;
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof obj['subtitle'] === 'string') return obj['subtitle'];
  return '';
}

function extractCoverFromEntity(entity: any): string {
  if (!entity || typeof entity !== 'object') return '';

  // visualIdentity.image
  const viImages = entity.visualIdentity?.image;
  if (Array.isArray(viImages) && viImages.length > 0) {
    const sorted = [...viImages].sort((a: any, b: any) => (b.maxWidth || b.maxHeight || 0) - (a.maxWidth || a.maxHeight || 0));
    const u = sorted[0]?.url;
    if (typeof u === 'string') return u;
  }

  // coverArt.sources
  const sources = entity.coverArt?.sources;
  if (Array.isArray(sources) && sources.length > 0) {
    const sorted = [...sources].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    const u = sorted[0]?.url;
    if (typeof u === 'string') return u;
  }

  // images
  if (Array.isArray(entity.images) && entity.images.length > 0) {
    const sorted = [...entity.images].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    const u = sorted[0]?.url;
    if (typeof u === 'string') return u;
  }

  return '';
}

function extractEmbedImage(obj: Record<string, unknown>): string {
  const direct = extractCoverFromEntity(obj);
  if (direct) return direct;

  const albumOfTrack = obj['albumOfTrack'] as Record<string, unknown> | undefined;
  const coverArt = albumOfTrack?.['coverArt'] as Record<string, unknown> | undefined;
  const sources = coverArt?.['sources'];
  if (Array.isArray(sources) && sources.length > 0) {
    const sorted = [...sources].sort((a, b) => {
      const wa = ((a as Record<string, unknown>)?.['width'] as number) ?? 0;
      const wb = ((b as Record<string, unknown>)?.['width'] as number) ?? 0;
      return wb - wa;
    });
    return ((sorted[0] as Record<string, unknown>)?.['url'] as string) || '';
  }

  const albumImages = obj['albumImages'];
  if (Array.isArray(albumImages) && albumImages.length > 0) {
    return ((albumImages[0] as Record<string, unknown>)?.['url'] as string) || '';
  }

  if (typeof obj['imageUrl'] === 'string') return obj['imageUrl'];

  return '';
}

function findPlaylistName(root: Record<string, unknown>): string {
  const paths = [
    'props.pageProps.state.data.entity.name',
    'props.pageProps.data.entity.name',
    'props.pageProps.initialStoreState.entities.playlists.name',
  ];
  for (const path of paths) {
    const val = getPath(root, path);
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

function findPlaylistCover(root: Record<string, unknown>): string {
  const entity = getPath(root, 'props.pageProps.state.data.entity');
  const entityCover = extractCoverFromEntity(entity);
  if (entityCover) return entityCover;

  const paths = [
    'props.pageProps.state.data.entity.images.0.url',
    'props.pageProps.data.entity.images.0.url',
  ];
  for (const path of paths) {
    const val = getPath(root, path);
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}
