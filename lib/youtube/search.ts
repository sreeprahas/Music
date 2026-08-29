/**
 * lib/youtube/search.ts
 *
 * Lightweight YouTube Music search using yt-dlp.
 * Strictly queries YouTube Music and filters out long non-music videos (>10 mins)
 * unless explicitly specified with keywords like 'mashup', 'loop', '1 hour', etc.
 */

import { execYtDlp } from './ytdlp';
import { normalizeYtDlpTrack, normalizeYtDlpCandidate, type RawYtDlpEntry } from './normalizer';
import type { Track, YouTubeCandidate } from '@/types';
import { LruCache } from '@/lib/cache/lru';

const searchCache = new LruCache<{ tracks: Track[]; candidates: YouTubeCandidate[] }>(100);

export interface SearchYouTubeOptions {
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface YouTubeSearchResult {
  tracks: Track[];
  candidates: YouTubeCandidate[];
}

const LONG_DURATION_KEYWORDS = [
  'mashup', 'mix', 'remix', 'loop', '1 hour', '1hour', '1 hr', '1hr',
  '2 hours', '2hour', '2 hr', '10 hours', '10hour', 'compilation',
  'full album', 'extended', 'podcast', 'liveset', 'live set', 'set',
  'session', 'megamix', 'medley', 'continuous', 'dj mix', 'soundtrack',
  'ost', 'slowed', 'reverb', 'nightcore', 'instrumental', 'karaoke',
  'cover', 'concert', 'nonstop', 'non-stop', 'discography'
];

const JUNK_KEYWORDS = [
  'reaction', 'reacting', 'review', 'vlog', 'interview', 'unboxing',
  'tutorial', 'lesson', 'how to play', 'commentary', 'explained'
];

export function allowsLongDuration(query: string, title?: string): boolean {
  const text = `${query} ${title || ''}`.toLowerCase();
  return LONG_DURATION_KEYWORDS.some((kw) => text.includes(kw));
}

function scoreCandidate(query: string, track: Track): number {
  const q = query.trim().toLowerCase();
  const title = track.title.toLowerCase();
  const artist = track.artist.toLowerCase();

  let score = 0;

  // Exact or prefix title match
  if (title === q) score += 100;
  else if (title.startsWith(q)) score += 60;
  else if (title.includes(q)) score += 30;

  // Artist token match
  const qTokens = q.split(/\s+/);
  for (const token of qTokens) {
    if (token.length > 1 && artist.includes(token)) score += 15;
  }

  // Duration scoring: optimal single song duration is 2-6 mins
  const dur = track.duration || 0;
  if (dur >= 100 && dur <= 420) score += 25;
  else if (dur > 600 && !allowsLongDuration(query, track.title)) score -= 200;

  // Penalize non-music junk
  for (const junk of JUNK_KEYWORDS) {
    if (title.includes(junk)) score -= 150;
  }

  return score;
}

/**
 * Searches YouTube Music strictly for music tracks matching the query via yt-dlp.
 */
export async function searchYouTube(
  query: string,
  options: SearchYouTubeOptions = {},
): Promise<YouTubeSearchResult> {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return { tracks: [], candidates: [] };
  }

  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const cacheKey = `ytm-strict-search:${limit}:${trimmed.toLowerCase()}`;

  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Strictly target YouTube Music search endpoint
  const musicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(trimmed)}`;

  let lines: string[] = [];

  try {
    const musicResult = await execYtDlp({
      args: [
        '--dump-json',
        '--flat-playlist',
        '--no-warnings',
        '--skip-download',
        '--ignore-errors',
        musicUrl,
      ],
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 20_000,
    });

    lines = musicResult.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err) {
    // If strict YouTube Music search fails, report empty/error rather than falling back to normal YouTube
    console.error('[YouTube Music Search Error]:', err);
    return { tracks: [], candidates: [] };
  }

  const scoredEntries: Array<{ track: Track; candidate: YouTubeCandidate; score: number }> = [];
  const queryAllowsLong = allowsLongDuration(trimmed);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawYtDlpEntry;

      // Filter out long videos > 10 mins (600s) unless explicit keywords match
      if (parsed.duration && parsed.duration > 600 && !queryAllowsLong && !allowsLongDuration(trimmed, parsed.title)) {
        continue;
      }

      const track = normalizeYtDlpTrack(parsed, scoredEntries.length);
      const candidate = normalizeYtDlpCandidate(parsed);

      if (track && candidate) {
        if (track.duration && track.duration > 600 && !queryAllowsLong && !allowsLongDuration(trimmed, track.title)) {
          continue;
        }

        const score = scoreCandidate(trimmed, track);
        if (score >= -50) {
          scoredEntries.push({ track, candidate, score });
        }
      }
    } catch {
      // Ignore individual malformed lines
    }
  }

  // Rank deterministically by score descending
  scoredEntries.sort((a, b) => b.score - a.score);

  const tracks = scoredEntries.slice(0, limit).map((e, idx) => ({ ...e.track, position: idx + 1 }));
  const candidates = scoredEntries.slice(0, limit).map((e) => e.candidate);

  const searchResult = { tracks, candidates };
  searchCache.set(cacheKey, searchResult);
  return searchResult;
}
