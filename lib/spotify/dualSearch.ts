/**
 * Dual search engine — runs Spotify (noauth) and YTMusic (yt-dlp) searches in
 * parallel, deduplicates, and ranks results.
 *
 * Modes:
 *   - 'auto':    both sources in parallel, Spotify results first, then unique
 *               YTMusic results, ranked by relevance.
 *   - 'spotify': Spotify noauth search only.
 *   - 'ytmusic': YTMusic (yt-dlp) search only.
 *
 * Deduplication: track titles and artist strings are normalized (lowercased,
 * trimmed, punctuation/spaces collapsed) and matched. When a Spotify and a
 * YTMusic result refer to the same track, the Spotify result wins (it carries
 * richer metadata: album, ISRC, official artwork) and the YTMusic duplicate is
 * dropped — but the YTMusic videoId is preserved on the winning track so
 * playback can skip the YouTube resolution step.
 */

import { searchTracksNoauth } from './noauthApi';
import { normalizeTrack } from './normalize';
import { searchYouTube } from '../ytdlp/resolver';
import { getThumbnailUrl } from '../ytmusicFormat';
import type { Track } from '../../types';

export type SearchMode = 'auto' | 'spotify' | 'ytmusic';

/** Normalize a string for fuzzy dedup comparison. */
function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/[\s\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Build a dedup key from title + primary artist. */
function trackKey(title: string, artist: string): string {
  // Use only the first artist for matching (Spotify often lists "A, B" while
  // YTMusic lists "A"). The first artist is the strongest signal.
  const firstArtist = artist.split(/[,&]| feat\. | featuring /i)[0]?.trim() || artist;
  return `${normalizeKey(title)}::${normalizeKey(firstArtist)}`;
}

/** Run a Spotify noauth search and normalize to Track[]. */
async function spotifySearch(query: string, limit: number): Promise<Track[]> {
  try {
    const result = await searchTracksNoauth(query, limit);
    return result.items.map((track, i) => normalizeTrack(track, i));
  } catch (err) {
    console.warn('[dualSearch] Spotify search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Run a YTMusic (yt-dlp) search and normalize to Track[]. */
async function ytmusicSearch(query: string, limit: number): Promise<Track[]> {
  try {
    const candidates = await searchYouTube(query, limit);
    return candidates.map((c, i) => ({
      videoId: c.videoId,
      title: c.title,
      artist: c.channel || 'Unknown artist',
      thumbnailUrl: getThumbnailUrl(c.videoId, c.title),
      duration: c.duration,
      position: i,
    } as Track));
  } catch (err) {
    console.warn('[dualSearch] YTMusic search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Run the dual search engine.
 *
 * In 'auto' mode, both sources run in parallel via Promise.all. Results are
 * deduplicated by normalized (title, first-artist). Spotify results take
 * priority — when a duplicate exists, the Spotify entry wins and absorbs the
 * YTMusic videoId so playback can skip YouTube resolution.
 */
export async function dualSearch(query: string, mode: SearchMode, limit = 20): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  if (mode === 'spotify') return spotifySearch(q, limit);
  if (mode === 'ytmusic') return ytmusicSearch(q, limit);

  // 'auto' — run both in parallel.
  const [spotifyResults, ytmusicResults] = await Promise.all([
    spotifySearch(q, limit),
    ytmusicSearch(q, limit),
  ]);

  // Index YTMusic results by dedup key so we can attach videoIds to matching
  // Spotify tracks and drop the duplicates.
  const ytByKey = new Map<string, Track>();
  for (const yt of ytmusicResults) {
    const key = trackKey(yt.title, yt.artist);
    if (!ytByKey.has(key)) ytByKey.set(key, yt);
  }

  const seen = new Set<string>();
  const merged: Track[] = [];

  // 1. Spotify results first (priority). Absorb matching YTMusic videoId.
  for (const sp of spotifyResults) {
    const key = trackKey(sp.title, sp.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    const ytMatch = ytByKey.get(key);
    if (ytMatch?.videoId && !sp.videoId) {
      // Preserve the resolved YouTube videoId so playback skips resolution.
      sp.videoId = ytMatch.videoId;
      // Prefer the YouTube thumbnail once we have a videoId (local cacheable).
      sp.thumbnailUrl = getThumbnailUrl(ytMatch.videoId, sp.title);
    }
    merged.push(sp);
    ytByKey.delete(key);
  }

  // 2. Append unique YTMusic results that didn't match any Spotify track.
  for (const yt of ytmusicResults) {
    const key = trackKey(yt.title, yt.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(yt);
  }

  // Re-index positions after merging.
  return merged.map((t, i) => ({ ...t, position: i }));
}
