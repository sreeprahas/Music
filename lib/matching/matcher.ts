/**
 * lib/matching/matcher.ts
 *
 * Dedicated Spotify → YouTube Music matching service.
 * Builds intelligent candidate queries, scores candidates, breaks ties,
 * evaluates thresholds, and caches confident matches into SQLite.
 */

import type { YouTubeCandidate } from '@/types';
import { searchYouTube } from '@/lib/youtube/search';
import { scoreTrackCandidate, rankAndBreakTieCandidates, type SpotifyTrackTarget, type ScoredMatchCandidate } from './scoring';
import { getYoutubeMapping, setYoutubeMapping } from '@/lib/storage/mapping';
import { normalizeTrack } from './normalization';
import { detectVersion } from './version';

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
  const norm = normalizeTrack({
    title: target.title,
    artist: target.artist,
    album: target.album,
  });

  const version = detectVersion(target.title);
  const queries: string[] = [];

  // 1. Primary: Artist + Clean Title
  const primaryQuery = `${norm.primaryArtist} ${norm.identityTitle}`.trim();
  if (primaryQuery) queries.push(primaryQuery);

  // 2. Exact Title + Primary Artist
  const titleFirstQuery = `${norm.cleanTitle} ${norm.primaryArtist}`.trim();
  if (titleFirstQuery && !queries.includes(titleFirstQuery)) {
    queries.push(titleFirstQuery);
  }

  // 3. If version detected (like remix or live), add explicit query
  if (version !== 'studio') {
    const versionQuery = `${norm.primaryArtist} ${norm.identityTitle} ${version}`.trim();
    if (!queries.includes(versionQuery)) {
      queries.push(versionQuery);
    }
  }

  // 4. Title only fallback (used only if initial queries return nothing)
  const titleOnly = norm.identityTitle.trim();
  if (titleOnly && !queries.includes(titleOnly)) {
    queries.push(titleOnly);
  }

  return queries;
}

export async function matchSpotifyTrack(
  target: SpotifyTrackTarget,
  options: { forceSearch?: boolean; signal?: AbortSignal } = {},
): Promise<MatchResult> {
  const spotifyId = target.id;

  // 1. Check persistent SQLite cache
  if (spotifyId && !options.forceSearch) {
    const cached = getYoutubeMapping(spotifyId);
    if (cached?.youtubeVideoId) {
      return {
        matched: true,
        score: 100,
        confidence: 'excellent',
        candidate: {
          videoId: cached.youtubeVideoId,
          title: cached.matchedTitle || target.title,
          channel: cached.matchedArtist || target.artist,
          duration: cached.duration || target.duration,
        },
        breakdown: { title: 40, artist: 30, duration: 20, album: 10, penalties: 0 },
        source: 'cache',
      };
    }
  }

  // 2. Generate queries and collect candidates
  const queries = buildCandidateQueries(target);
  const candidatesMap = new Map<string, YouTubeCandidate>();

  for (const query of queries.slice(0, 2)) {
    try {
      const { candidates } = await searchYouTube(query, { limit: 10, signal: options.signal });
      for (const cand of candidates) {
        if (!candidatesMap.has(cand.videoId)) {
          candidatesMap.set(cand.videoId, cand);
        }
      }
      if (candidatesMap.size >= 10) break;
    } catch (err) {
      console.warn(`[matching] Query failed: '${query}'`, err);
    }
  }

  const candidateList = Array.from(candidatesMap.values());
  if (candidateList.length === 0) {
    return {
      matched: false,
      score: 0,
      confidence: 'reject',
      candidate: null,
      rejectionReason: 'No match candidates available',
      source: 'none',
    };
  }

  // 3. Score all candidates
  const scoredCandidates: ScoredMatchCandidate[] = candidateList.map((cand) =>
    scoreTrackCandidate(cand, target),
  );

  // 4. Rank and deterministic tie-break
  const ranked = rankAndBreakTieCandidates(scoredCandidates);
  const best = ranked[0];

  if (!best || !best.matched) {
    return {
      matched: false,
      score: best?.score || 0,
      confidence: best?.confidence || 'reject',
      candidate: best?.candidate || null,
      breakdown: best?.breakdown,
      appliedPenalties: best?.appliedPenalties,
      rejectionReason: best?.rejectionReason || 'No candidate met confidence threshold',
      normalizedSpotifyTitle: best?.normalizedSpotifyTitle,
      normalizedCandidateTitle: best?.normalizedCandidateTitle,
      normalizedSpotifyArtist: best?.normalizedSpotifyArtist,
      normalizedCandidateArtist: best?.normalizedCandidateArtist,
      detectedSpotifyVersion: best?.detectedSpotifyVersion,
      detectedCandidateVersion: best?.detectedCandidateVersion,
      source: 'search',
    };
  }

  // 5. Persist confident match in SQLite cache
  if (spotifyId) {
    setYoutubeMapping({
      spotifyTrackId: spotifyId,
      youtubeVideoId: best.candidate.videoId,
      matchedTitle: best.candidate.title,
      matchedArtist: best.candidate.channel,
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
