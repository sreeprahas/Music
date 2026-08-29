/**
 * Spotify -> YouTube Music matching scorer.
 *
 * Identity fields, in order:
 *   1. title
 *   2. artist
 *   3. duration
 *
 * Album is deliberately ignored. Artwork is handled separately as a last-resort
 * tie breaker in matcher.ts so a network image comparison never slows normal matches.
 */

import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from './config';
import { normalizeTrack, stringSimilarity, tokenSimilarity } from './normalization';
import { detectVersion, type TrackVersion } from './version';
import type { YouTubeCandidate } from '@/types';

export interface SpotifyTrackTarget {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  thumbnailUrl?: string;
}

export type MatchConfidence = 'excellent' | 'strong' | 'acceptable' | 'weak' | 'reject';

export interface AppliedPenalty {
  reason: string;
  points: number;
}

export interface ScoreBreakdown {
  title: number;
  artist: number;
  duration: number;
  album: number;
  penalties: number;
}

export interface ScoredMatchCandidate {
  candidate: YouTubeCandidate;
  score: number;
  confidence: MatchConfidence;
  matched: boolean;
  breakdown: ScoreBreakdown;
  appliedPenalties: AppliedPenalty[];
  rejectionReason?: string;
  hardRejected: boolean;
  normalizedSpotifyTitle: string;
  normalizedCandidateTitle: string;
  normalizedSpotifyArtist: string;
  normalizedCandidateArtist: string;
  detectedSpotifyVersion: TrackVersion;
  detectedCandidateVersion: TrackVersion;
}

function interpolate(value: number, minIn: number, maxIn: number, minOut: number, maxOut: number): number {
  if (maxIn === minIn) return minOut;
  const ratio = Math.max(0, Math.min(1, (value - minIn) / (maxIn - minIn)));
  return Math.round(minOut + ratio * (maxOut - minOut));
}

function durationPoints(
  targetDuration: number | undefined,
  candidateDuration: number | undefined,
  weights: ScoringWeights,
): number {
  if (!targetDuration || !candidateDuration) return 0;

  const diff = Math.abs(targetDuration - candidateDuration);
  for (const tier of weights.duration.tiers) {
    if (diff <= tier.maxDiffSeconds) return tier.points;
  }
  return 0;
}

export function scoreTrackCandidate(
  candidate: YouTubeCandidate,
  target: SpotifyTrackTarget,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): ScoredMatchCandidate {
  const spotify = normalizeTrack({
    title: target.title,
    artist: target.artist,
  });
  const youtube = normalizeTrack({
    title: candidate.title,
    artist: candidate.channel || candidate.artist || '',
  });

  const spotifyVersion = detectVersion(target.title);
  const candidateVersion = detectVersion(candidate.title);

  // TITLE: 45 points.
  const exactTitle =
    spotify.cleanTitle === youtube.cleanTitle ||
    spotify.identityTitle === youtube.identityTitle;

  const titleSimilarity = exactTitle
    ? 1
    : Math.max(
        stringSimilarity(spotify.identityTitle, youtube.identityTitle),
        stringSimilarity(spotify.cleanTitle, youtube.cleanTitle),
        tokenSimilarity(spotify.titleTokens, youtube.titleTokens),
      );

  let titleScore = 0;
  if (exactTitle) {
    titleScore = weights.title.exact;
  } else if (titleSimilarity >= 0.88) {
    titleScore = interpolate(titleSimilarity, 0.88, 1, weights.title.veryStrong[0], weights.title.veryStrong[1]);
  } else if (titleSimilarity >= 0.70) {
    titleScore = interpolate(titleSimilarity, 0.70, 0.87, weights.title.strong[0], weights.title.strong[1]);
  } else if (titleSimilarity >= 0.45) {
    titleScore = interpolate(titleSimilarity, 0.45, 0.69, weights.title.moderate[0], weights.title.moderate[1]);
  } else if (titleSimilarity > 0.1) {
    titleScore = interpolate(titleSimilarity, 0.1, 0.44, weights.title.weak[0], weights.title.weak[1]);
  }

  // ARTIST: 35 points. Primary artist agreement is much more important than
  // loose token overlap so unrelated uploads do not win on title alone.
  const primaryArtistSimilarity = stringSimilarity(
    spotify.primaryArtist,
    youtube.primaryArtist,
  );
  const allArtistsSimilarity = tokenSimilarity(
    spotify.allArtistTokens,
    youtube.allArtistTokens,
  );
  const artistSimilarity = Math.max(primaryArtistSimilarity, allArtistsSimilarity);

  let artistScore = 0;
  if (
    spotify.primaryArtist &&
    youtube.primaryArtist &&
    spotify.primaryArtist === youtube.primaryArtist
  ) {
    artistScore = weights.artist.exact;
  } else if (primaryArtistSimilarity >= 0.88) {
    artistScore = interpolate(primaryArtistSimilarity, 0.88, 1, weights.artist.veryStrong[0], weights.artist.veryStrong[1]);
  } else if (primaryArtistSimilarity >= 0.70) {
    artistScore = interpolate(primaryArtistSimilarity, 0.70, 0.87, weights.artist.strong[0], weights.artist.strong[1]);
  } else if (allArtistsSimilarity >= 0.50) {
    artistScore = interpolate(allArtistsSimilarity, 0.50, 0.85, weights.artist.featuredCompatible[0], weights.artist.featuredCompatible[1]);
  } else if (artistSimilarity > 0.1) {
    artistScore = interpolate(artistSimilarity, 0.1, 0.49, weights.artist.weak[0], weights.artist.weak[1]);
  } else {
    artistScore = weights.artist.majorMismatchPenalty;
  }

  // DURATION: 20 points, deliberately tolerant of Spotify/YouTube metadata differences.
  const durationScore = durationPoints(target.duration, candidate.duration, weights);

  const appliedPenalties: AppliedPenalty[] = [];
  let hardRejected = false;
  let rejectionReason: string | undefined;

  // A clear artist mismatch is not allowed to become a match just because the title is popular.
  if (artistScore <= weights.artist.majorMismatchPenalty) {
    hardRejected = true;
    rejectionReason = `Major artist mismatch: Spotify artist '${spotify.rawArtist}' does not match YouTube artist '${youtube.rawArtist}'`;
  }

  if (spotifyVersion !== candidateVersion) {
    if (spotifyVersion === 'studio' && candidateVersion === 'live') {
      appliedPenalties.push({ reason: 'Live vs studio conflict', points: weights.penalties.liveVsStudio });
    }
    if (spotifyVersion === 'studio' && candidateVersion === 'acoustic') {
      appliedPenalties.push({ reason: 'Acoustic vs studio conflict', points: weights.penalties.acousticVsStudio });
    }
    if (spotifyVersion === 'studio' && candidateVersion === 'remix') {
      appliedPenalties.push({ reason: 'Remix vs original conflict', points: weights.penalties.remixVsOriginal });
    }
    if (candidateVersion === 'instrumental' && spotifyVersion !== 'instrumental') {
      appliedPenalties.push({ reason: 'Instrumental vs vocal conflict', points: weights.penalties.instrumentalVsVocal });
      hardRejected = true;
      rejectionReason = 'Instrumental track rejected for vocal target';
    }
    if (candidateVersion === 'karaoke' && spotifyVersion !== 'karaoke') {
      appliedPenalties.push({ reason: 'Karaoke vs original conflict', points: weights.penalties.karaokeVsOriginal });
      hardRejected = true;
      rejectionReason = 'Karaoke track rejected for original target';
    }
    if (candidateVersion === 'cover' && spotifyVersion !== 'cover') {
      appliedPenalties.push({ reason: 'Cover vs original conflict', points: weights.penalties.coverVsOriginal });
      hardRejected = true;
      rejectionReason = 'Cover track rejected for original target';
    }
    if (candidateVersion === 'mashup' && spotifyVersion !== 'mashup') {
      appliedPenalties.push({ reason: 'Mashup vs original conflict', points: weights.penalties.mashupVsOriginal });
      hardRejected = true;
      rejectionReason = 'Mashup rejected for original target';
    }
    if (['nightcore', 'sped_up', 'slowed'].includes(candidateVersion) && !['nightcore', 'sped_up', 'slowed'].includes(spotifyVersion)) {
      appliedPenalties.push({ reason: 'Speed or pitch modification conflict', points: weights.penalties.speedOrPitchMismatch });
    }
    if (['extended', 'radio_edit'].includes(candidateVersion) && spotifyVersion === 'studio') {
      appliedPenalties.push({ reason: 'Edit/version difference', points: weights.penalties.majorEditMismatch });
    }
    if (candidateVersion === 'remastered' && spotifyVersion === 'studio') {
      appliedPenalties.push({ reason: 'Remastered vs studio difference', points: weights.penalties.remasteredVsOriginal });
    }
    if (candidateVersion === 'clean' && spotifyVersion === 'explicit') {
      appliedPenalties.push({ reason: 'Clean vs explicit difference', points: weights.penalties.cleanExplicitMismatch });
    }
  }

  const totalPenalties = appliedPenalties.reduce((sum, penalty) => sum + penalty.points, 0);
  const positiveScore = titleScore + Math.max(0, artistScore) + durationScore;
  const rawFinalScore = positiveScore + totalPenalties + (artistScore < 0 ? artistScore : 0);
  const finalScore = Math.max(0, Math.min(100, rawFinalScore));

  let confidence: MatchConfidence = 'reject';
  if (finalScore >= weights.thresholds.excellent) confidence = 'excellent';
  else if (finalScore >= weights.thresholds.strong) confidence = 'strong';
  else if (finalScore >= weights.thresholds.acceptable) confidence = 'acceptable';
  else if (finalScore >= weights.thresholds.weak) confidence = 'weak';

  // Require both identity fields to be reasonably strong. This prevents a
  // generic title from matching a completely different artist.
  const identityCompatible =
    titleSimilarity >= 0.70 &&
    artistSimilarity >= 0.70;

  const matched = !hardRejected && identityCompatible && finalScore >= weights.thresholds.autoMatch;

  if (!matched && !rejectionReason) {
    if (!identityCompatible) {
      rejectionReason = 'Title and artist did not both meet the identity threshold';
    } else {
      rejectionReason = `Score ${finalScore} is below auto-match threshold ${weights.thresholds.autoMatch}`;
    }
  }

  return {
    candidate,
    score: finalScore,
    confidence,
    matched,
    breakdown: {
      title: titleScore,
      artist: artistScore,
      duration: durationScore,
      album: 0,
      penalties: totalPenalties,
    },
    appliedPenalties,
    rejectionReason,
    hardRejected,
    normalizedSpotifyTitle: spotify.identityTitle,
    normalizedCandidateTitle: youtube.identityTitle,
    normalizedSpotifyArtist: spotify.primaryArtist,
    normalizedCandidateArtist: youtube.primaryArtist,
    detectedSpotifyVersion: spotifyVersion,
    detectedCandidateVersion: candidateVersion,
  };
}

export function rankAndBreakTieCandidates(candidates: ScoredMatchCandidate[]): ScoredMatchCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (b.breakdown.artist !== a.breakdown.artist) return b.breakdown.artist - a.breakdown.artist;
    if (b.breakdown.title !== a.breakdown.title) return b.breakdown.title - a.breakdown.title;
    if (b.breakdown.duration !== a.breakdown.duration) return b.breakdown.duration - a.breakdown.duration;
    if (a.breakdown.penalties !== b.breakdown.penalties) return b.breakdown.penalties - a.breakdown.penalties;
    return 0;
  });
}
