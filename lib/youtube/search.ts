import {
  searchYouTubeMusic,
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

  const cacheKey =
    `youtubei:${limit}:${trimmed.toLowerCase()}`;

  const cached =
    searchCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const items =
    await searchYouTubeMusic(
      trimmed,
      options.signal,
    );

  const entries: Array<{
    track: Track;
    candidate: YouTubeCandidate;
    score: number;
  }> = [];

  for (
    const item of items
  ) {
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
        score(
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
  };

  searchCache.set(
    cacheKey,
    result,
  );

  return result;
}