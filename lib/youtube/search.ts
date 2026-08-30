import {
  searchYouTubeMusic,
  searchYouTubeArtists,
} from './innertube';

import type {
  Track,
  YouTubeCandidate,
} from '@/types';

import {
  LruCache,
} from '@/lib/cache/lru';

const searchCache =
  new LruCache<{
    tracks: Track[];
    candidates: YouTubeCandidate[];
  }>(100);

export type SearchFilter = 'song' | 'artist';

export interface SearchYouTubeOptions {
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 'song' (default) treats the query as a title/keyword search. 'artist' ranks by artist match. */
  filter?: SearchFilter;
}

export interface YouTubeSearchResult {
  tracks: Track[];
  candidates: YouTubeCandidate[];
  /** Canonical artist name resolved by an artist search (null otherwise). */
  artistName?: string | null;
}

const LONG_DURATION_KEYWORDS = [
  'mashup',
  'mix',
  'remix',
  'loop',
  '1 hour',
  '1hour',
  '1 hr',
  '1hr',
  '2 hours',
  '2hour',
  '2 hr',
  '10 hours',
  '10hour',
  'compilation',
  'full album',
  'extended',
  'podcast',
  'liveset',
  'live set',
  'set',
  'session',
  'megamix',
  'medley',
  'continuous',
  'dj mix',
  'soundtrack',
  'ost',
  'slowed',
  'reverb',
  'nightcore',
  'instrumental',
  'karaoke',
  'cover',
  'concert',
  'nonstop',
  'non-stop',
  'discography',
];

const JUNK_KEYWORDS = [
  'reaction',
  'reacting',
  'review',
  'vlog',
  'interview',
  'unboxing',
  'tutorial',
  'lesson',
  'how to play',
  'commentary',
  'explained',
];

export function allowsLongDuration(
  query: string,
  title?: string,
): boolean {
  const value =
    `${query} ${title ?? ''}`.toLowerCase();

  return LONG_DURATION_KEYWORDS.some(
    (keyword) =>
      value.includes(keyword),
  );
}

function score(
  query: string,
  track: Track,
): number {
  const q =
    query.toLowerCase();

  const title =
    track.title.toLowerCase();

  const artist =
    track.artist.toLowerCase();

  let result = 0;

  if (title === q) {
    result += 100;
  } else if (title.startsWith(q)) {
    result += 60;
  } else if (title.includes(q)) {
    result += 30;
  }

  for (
    const token of q.split(/\s+/)
  ) {
    if (
      token.length > 1 &&
      artist.includes(token)
    ) {
      result += 15;
    }
  }

  const duration =
    track.duration ?? 0;

  if (
    duration >= 100 &&
    duration <= 420
  ) {
    result += 25;
  } else if (
    duration > 600 &&
    !allowsLongDuration(
      query,
      track.title,
    )
  ) {
    result -= 200;
  }

  for (
    const keyword of JUNK_KEYWORDS
  ) {
    if (
      title.includes(keyword)
    ) {
      result -= 150;
    }
  }

  return result;
}

/**
 * Artist-first relevance used when the user explicitly searches by artist.
 *
 * The generic scorer above favours title matches, which buries an artist's
 * real songs under unrelated tracks that merely mention the artist name in
 * their title. This scorer flips the priorities: the artist string is the
 * primary signal, the title is a tie-breaker.
 */
export function artistScore(
  query: string,
  track: Track,
): number {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const artist = track.artist.toLowerCase();
  const title = track.title.toLowerCase();

  let result = 0;

  if (artist === q) {
    result += 260;
  } else if (artist.includes(q) || q.includes(artist)) {
    result += 150;
  }

  // Partial artist names: every query token found in the artist string.
  const tokens = q.split(/\s+/).filter((token) => token.length > 1);
  if (tokens.length > 0) {
    let matchedTokens = 0;
    for (const token of tokens) {
      if (artist.includes(token)) matchedTokens += 1;
    }
    result += Math.round((matchedTokens / tokens.length) * 140);
    // All tokens matched → strongly prefer these over partial matches.
    if (matchedTokens === tokens.length) result += 60;
  }

  // Songs that literally carry the query in the title still surface.
  if (title.includes(q)) result += 25;

  const duration = track.duration ?? 0;
  if (duration >= 100 && duration <= 420) {
    result += 15;
  } else if (duration > 600 && !allowsLongDuration(query, track.title)) {
    result -= 200;
  }

  for (const keyword of JUNK_KEYWORDS) {
    if (title.includes(keyword)) result -= 150;
  }

  return result;
}

export async function searchYouTube(
  query: string,
  options: SearchYouTubeOptions = {},
): Promise<YouTubeSearchResult> {
  const trimmed =
    query.trim();

  if (!trimmed) {
    return {
      tracks: [],
      candidates: [],
    };
  }

  const limit =
    Math.min(
      50,
      Math.max(
        1,
        options.limit ?? 20,
      ),
    );

  const filter: SearchFilter = options.filter === 'artist' ? 'artist' : 'song';
  const cacheKey =
    `youtubei:${filter}:${limit}:${trimmed.toLowerCase()}`;

  const cached =
    searchCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const items: Awaited<ReturnType<typeof searchYouTubeMusic>> = [];
  let resolvedArtistName: string | null = null;

  if (filter === 'artist') {
    // Resolve the canonical artist (partial names included) and pull its
    // songs. When no artist matches, the plain song search below keeps the
    // behaviour predictable instead of returning nothing.
    try {
      const artistResult = await searchYouTubeArtists(trimmed, options.signal);
      resolvedArtistName = artistResult.artistName;
      items.push(...artistResult.items);
    } catch (err) {
      if (options.signal?.aborted) throw err;
      console.warn('[youtube/search] artist resolution failed:', err instanceof Error ? err.message : err);
    }
  }

  const songItems = await searchYouTubeMusic(trimmed, options.signal);
  items.push(...songItems);

  const ranking = filter === 'artist' ? artistScore : score;

  const entries: Array<{
    track: Track;
    candidate: YouTubeCandidate;
    score: number;
  }> = [];

  const seenVideoIds = new Set<string>();

  for (
    const item of items
  ) {
    if (seenVideoIds.has(item.videoId)) continue;
    seenVideoIds.add(item.videoId);

    if (
      item.duration &&
      item.duration > 600 &&
      !allowsLongDuration(
        trimmed,
        item.title,
      )
    ) {
      continue;
    }

    const track: Track = {
      videoId: item.videoId,
      title: item.title,
      artist: item.artist,
      thumbnailUrl:
        item.thumbnailUrl,
      duration: item.duration,
      position: 0,
      source: 'youtube',
      sourceTrackId:
        item.videoId,
      dateAdded:
        new Date().toISOString(),
    };

    const candidate:
      YouTubeCandidate = {
        videoId:
          item.videoId,
        title:
          item.title,
        channel:
          item.artist,
        artist:
          item.artist,
        duration:
          item.duration,
        thumbnails: [
          item.thumbnailUrl,
        ],
      };

    entries.push({
      track,
      candidate,
      score:
        ranking(
          trimmed,
          track,
        ),
    });
  }

  entries.sort(
    (a, b) =>
      b.score - a.score,
  );

  const tracks =
    entries
      .slice(0, limit)
      .map(
        (entry, index) => ({
          ...entry.track,
          position:
            index + 1,
        }),
      );

  const candidates =
    entries
      .slice(0, limit)
      .map(
        (entry) =>
          entry.candidate,
      );

  const result = {
    tracks,
    candidates,
    ...(filter === 'artist' ? { artistName: resolvedArtistName } : {}),
  };

  searchCache.set(
    cacheKey,
    result,
  );

  return result;
}