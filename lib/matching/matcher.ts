/**
 * Spotify -> YouTube Music matching service.
 *
 * Identity order:
 *   title -> artist -> duration
 *
 * Artwork is only consulted as a final tie-breaker between otherwise very
 * close candidates. Album and Spotify playlist metadata never participate in
 * candidate identity.
 */

import type { YouTubeCandidate } from '@/types';
import { searchYouTube } from '@/lib/youtube/search';
import { scoreTrackCandidate, rankAndBreakTieCandidates, type SpotifyTrackTarget, type ScoredMatchCandidate } from './scoring';
import { getYoutubeMapping, setYoutubeMapping } from '@/lib/storage/mapping';
import { normalizeTrack } from './normalization';
import { detectVersion } from './version';
import { compareArtwork } from './artwork';

export interface MatchResult {
  matched: boolean;
  score: number;
  confidence: 'excellent' | 'strong' | 'acceptable' | 'weak' | 'reject';
  candidate: YouTubeCandidate | null;
  breakdown?: {
    title: number;
    artist: number;
    duration: number;
    album: number;
    penalties: number;
  };
  appliedPenalties?: Array<{ reason: string; points: number }>;
  rejectionReason?: string;
  normalizedSpotifyTitle?: string;
  normalizedCandidateTitle?: string;
  normalizedSpotifyArtist?: string;
  normalizedCandidateArtist?: string;
  detectedSpotifyVersion?: string;
  detectedCandidateVersion?: string;
  source: 'cache' | 'search' | 'none';
}

export function buildCandidateQueries(target: SpotifyTrackTarget): string[] {
  const normalized = normalizeTrack({
    title: target.title,
    artist: target.artist,
  });
  const version = detectVersion(target.title);
  const queries: string[] = [];

  // Keep the search narrow. Both queries still stay inside YouTube Music song search.
  const artistFirst = `${normalized.primaryArtist} ${normalized.identityTitle}`.trim();
  const titleFirst = `${normalized.identityTitle} ${normalized.primaryArtist}`.trim();

  if (artistFirst) queries.push(artistFirst);
  if (titleFirst && titleFirst !== artistFirst) queries.push(titleFirst);

  // If Spotify explicitly identifies a version, let YT Music search for it too.
  if (version !== 'studio') {
    const versionQuery = `${normalized.primaryArtist} ${normalized.identityTitle} ${version}`.trim();
    if (versionQuery && !queries.includes(versionQuery)) queries.push(versionQuery);
  }

  return queries;
}

async function applyArtworkTieBreaker(
  ranked: ScoredMatchCandidate[],
  target: SpotifyTrackTarget,
): Promise<ScoredMatchCandidate[]> {
  if (!target.thumbnailUrl || ranked.length < 2) return ranked;

  const best = ranked[0];
  if (!best?.matched) return ranked;

  // Artwork is expensive. Only inspect candidates close enough to plausibly be
  // the same song, and never use it to rescue a weak metadata match.
  const closeCandidates = ranked.filter(
    (item) => item.matched && best.score - item.score <= 4,
  ).slice(0, 3);

  if (closeCandidates.length < 2) return ranked;

  const comparisons = await Promise.all(
    closeCandidates.map(async (item) => {
      const candidateArtwork = item.candidate.thumbnails?.[0];
      if (!candidateArtwork) return { item, strong: false, perceptual: 0, color: 0 };

      const comparison = await compareArtwork(target.thumbnailUrl!, candidateArtwork);
      return { item, ...comparison };
    }),
  );

  comparisons.sort((a, b) => {
    if (a.strong !== b.strong) return a.strong ? -1 : 1;
    if (b.perceptual !== a.perceptual) return b.perceptual - a.perceptual;
    return b.color - a.color;
  });

  const artworkWinner = comparisons[0]?.item;
  if (!artworkWinner || !comparisons[0]?.strong) return ranked;

  return [artworkWinner, ...ranked.filter((item) => item !== artworkWinner)];
}

async function matchSpotifyTrackInternal(
  target: SpotifyTrackTarget,
  options: { forceSearch?: boolean; signal?: AbortSignal } = {},
): Promise<MatchResult> {
  const spotifyId = target.id;

  if (spotifyId && !options.forceSearch) {
    const cached = getYoutubeMapping(spotifyId);
    if (cached?.youtubeVideoId) {
      // Never blindly trust an old mapping. Re-score the cached metadata with
      // the current title + artist + duration rules so old bad mappings can
      // automatically fall through to a fresh YouTube Music search.
      const cachedCandidate: YouTubeCandidate = {
        videoId: cached.youtubeVideoId,
        title: cached.matchedTitle || target.title,
        channel: cached.matchedArtist || target.artist,
        artist: cached.matchedArtist || target.artist,
        duration: cached.duration || target.duration,
      };
      const cachedScore = scoreTrackCandidate(cachedCandidate, target);

      if (cachedScore.matched) {
        return {
          matched: true,
          score: 100,
          confidence: 'excellent',
          candidate: cachedCandidate,
          breakdown: cachedScore.breakdown,
          appliedPenalties: cachedScore.appliedPenalties,
          source: 'cache',
        };
      }
    }
  }

  const queries = buildCandidateQueries(target);
  const candidatesMap = new Map<string, YouTubeCandidate>();

  for (const query of queries.slice(0, 2)) {
    try {
      const { candidates } = await searchYouTube(query, {
        limit: 12,
        signal: options.signal,
      });

      for (const candidate of candidates) {
        if (!candidatesMap.has(candidate.videoId)) {
          candidatesMap.set(candidate.videoId, candidate);
        }
      }

      if (candidatesMap.size >= 12) break;
    } catch (error) {
      console.warn(`[matching] YouTube Music query failed: '${query}'`, error);
    }
  }

  const candidateList = Array.from(candidatesMap.values());
  if (candidateList.length === 0) {
    return {
      matched: false,
      score: 0,
      confidence: 'reject',
      candidate: null,
      rejectionReason: 'No YouTube Music song candidates available',
      source: 'none',
    };
  }

  const scoredCandidates = candidateList.map((candidate) =>
    scoreTrackCandidate(candidate, target),
  );

  let ranked = rankAndBreakTieCandidates(scoredCandidates);
  ranked = await applyArtworkTieBreaker(ranked, target);

  const best = ranked[0];

  if (!best || !best.matched) {
    return {
      matched: false,
      score: best?.score || 0,
      confidence: best?.confidence || 'reject',
      candidate: best?.candidate || null,
      breakdown: best?.breakdown,
      appliedPenalties: best?.appliedPenalties,
      rejectionReason: best?.rejectionReason || 'No candidate met the title + artist match threshold',
      normalizedSpotifyTitle: best?.normalizedSpotifyTitle,
      normalizedCandidateTitle: best?.normalizedCandidateTitle,
      normalizedSpotifyArtist: best?.normalizedSpotifyArtist,
      normalizedCandidateArtist: best?.normalizedCandidateArtist,
      detectedSpotifyVersion: best?.detectedSpotifyVersion,
      detectedCandidateVersion: best?.detectedCandidateVersion,
      source: 'search',
    };
  }

  if (spotifyId) {
    setYoutubeMapping({
      spotifyTrackId: spotifyId,
      youtubeVideoId: best.candidate.videoId,
      matchedTitle: best.candidate.title,
      matchedArtist: best.candidate.channel || best.candidate.artist,
      duration: best.candidate.duration,
      resolvedAt: Date.now(),
      matchMethod: 'metadata',
    });
  }

  return {
    matched: true,
    score: best.score,
    confidence: best.confidence,
    candidate: best.candidate,
    breakdown: best.breakdown,
    appliedPenalties: best.appliedPenalties,
    rejectionReason: best.rejectionReason,
    normalizedSpotifyTitle: best.normalizedSpotifyTitle,
    normalizedCandidateTitle: best.normalizedCandidateTitle,
    normalizedSpotifyArtist: best.normalizedSpotifyArtist,
    normalizedCandidateArtist: best.normalizedCandidateArtist,
    detectedSpotifyVersion: best.detectedSpotifyVersion,
    detectedCandidateVersion: best.detectedCandidateVersion,
    source: 'search',
  };
}


/**
 * Coalesce simultaneous Spotify -> YouTube Music resolutions for the same
 * Spotify track. PlayerBar and background prefetch can therefore request the
 * same track at the same time without running duplicate searches.
 */
const matchInFlight = new Map<string, Promise<MatchResult>>();

export function matchSpotifyTrack(
  target: SpotifyTrackTarget,
  options: { forceSearch?: boolean; signal?: AbortSignal } = {},
): Promise<MatchResult> {
  const key = target.id
    ? `${target.id}:${options.forceSearch ? 'force' : 'normal'}`
    : `anonymous:${target.title.toLowerCase()}|${target.artist.toLowerCase()}|${target.duration ?? ''}`;

  const existing = matchInFlight.get(key);
  if (existing) return existing;

  // Once a search starts, it is shared by all callers. Do not bind the shared
  // operation to an individual HTTP request's AbortSignal; otherwise the
  // background prefetch could cancel the foreground player request.
  const promise = matchSpotifyTrackInternal(target, {
    forceSearch: options.forceSearch,
  });

  matchInFlight.set(key, promise);

  void promise.finally(() => {
    if (matchInFlight.get(key) === promise) {
      matchInFlight.delete(key);
    }
  }).catch(() => {});

  return promise;
}
