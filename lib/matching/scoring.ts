/**
 * lib/matching/scoring.ts
 *
 * Explicit points-based scoring engine for Spotify → YouTube Music track matching.
 */

import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from './config';
import { normalizeTrack, stringSimilarity, tokenSimilarity, type NormalizedMetadata } from './normalization';
import { detectVersion, type TrackVersion } from './version';
import type { YouTubeCandidate } from '@/lib/youtube/types';

export interface SpotifyTrackTarget {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
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

function interpolate(val: number, minIn: number, maxIn: number, minOut: number, maxOut: number): number {
  if (maxIn === minIn) return minOut;
  const ratio = Math.max(0, Math.min(1, (val - minIn) / (maxIn - minIn)));
  return Math.round(minOut + ratio * (maxOut - minOut));
}

export function scoreTrackCandidate(
  candidate: YouTubeCandidate,
  target: SpotifyTrackTarget,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): ScoredMatchCandidate {
  const normSpotify = normalizeTrack({
    title: target.title,
    artist: target.artist,
    album: target.album,
  });

  const normCandidate = normalizeTrack({
    title: candidate.title,
    artist: candidate.channel || '',
    album: candidate.album,
  });

  const spotifyVersion = detectVersion(target.title);
  const candidateVersion = detectVersion(candidate.title);

  // 1. Title Scoring (max 40)
  let titleScore = 0;
  if (normSpotify.cleanTitle === normCandidate.cleanTitle || normSpotify.identityTitle === normCandidate.identityTitle) {
    titleScore = weights.title.exact;
  } else {
    const titleSim = Math.max(
      stringSimilarity(normSpotify.identityTitle, normCandidate.identityTitle),
      stringSimilarity(normSpotify.cleanTitle, normCandidate.cleanTitle),
      tokenSimilarity(normSpotify.titleTokens, normCandidate.titleTokens),
    );

    if (titleSim >= 0.88) {
      titleScore = interpolate(titleSim, 0.88, 1.0, weights.title.veryStrong[0], weights.title.veryStrong[1]);
    } else if (titleSim >= 0.70) {
      titleScore = interpolate(titleSim, 0.70, 0.87, weights.title.strong[0], weights.title.strong[1]);
    } else if (titleSim >= 0.45) {
      titleScore = interpolate(titleSim, 0.45, 0.69, weights.title.moderate[0], weights.title.moderate[1]);
    } else if (titleSim > 0.1) {
      titleScore = interpolate(titleSim, 0.1, 0.44, weights.title.weak[0], weights.title.weak[1]);
    } else {
      titleScore = weights.title.mismatch;
    }
  }

  // 2. Artist Scoring (max 30)
  let artistScore = 0;
  const primarySim = stringSimilarity(normSpotify.primaryArtist, normCandidate.primaryArtist);
  const allArtistsSim = tokenSimilarity(normSpotify.allArtistTokens, normCandidate.allArtistTokens);
  const bestArtistSim = Math.max(primarySim, allArtistsSim);

  const candidateChannelContainsSpotifyPrimary = normCandidate.cleanTitle.includes(normSpotify.primaryArtist) ||
    (normCandidate.primaryArtist && normCandidate.primaryArtist.includes(normSpotify.primaryArtist)) ||
    normSpotify.allArtists.some((a) => normCandidate.allArtists.includes(a));

  if (normSpotify.primaryArtist && normCandidate.primaryArtist && normSpotify.primaryArtist === normCandidate.primaryArtist) {
    artistScore = weights.artist.exact;
  } else if (primarySim >= 0.88) {
    artistScore = interpolate(primarySim, 0.88, 1.0, weights.artist.veryStrong[0], weights.artist.veryStrong[1]);
  } else if (primarySim >= 0.70) {
    artistScore = interpolate(primarySim, 0.70, 0.87, weights.artist.strong[0], weights.artist.strong[1]);
  } else if (candidateChannelContainsSpotifyPrimary || allArtistsSim >= 0.5) {
    artistScore = interpolate(bestArtistSim, 0.5, 0.85, weights.artist.featuredCompatible[0], weights.artist.featuredCompatible[1]);
  } else if (bestArtistSim > 0.1) {
    artistScore = interpolate(bestArtistSim, 0.1, 0.49, weights.artist.weak[0], weights.artist.weak[1]);
  } else {
    artistScore = weights.artist.majorMismatchPenalty; // -40
  }

  // 3. Duration Scoring (max 20)
  let durationScore = 0;
  if (target.duration && candidate.duration) {
    const diff = Math.abs(target.duration - candidate.duration);
    for (const tier of weights.duration.tiers) {
      if (diff <= tier.maxDiffSeconds) {
        durationScore = tier.points;
        break;
      }
    }
  }

  // 4. Album Scoring (max 10)
  let albumScore = 0;
  if (normSpotify.cleanAlbum && normCandidate.cleanAlbum) {
    if (normSpotify.cleanAlbum === normCandidate.cleanAlbum) {
      albumScore = weights.album.exact;
    } else {
      const albumSim = stringSimilarity(normSpotify.cleanAlbum, normCandidate.cleanAlbum);
      if (albumSim >= 0.70) {
        albumScore = interpolate(albumSim, 0.70, 1.0, weights.album.strong[0], weights.album.strong[1]);
      } else if (albumSim >= 0.40) {
        albumScore = interpolate(albumSim, 0.40, 0.69, weights.album.compatible[0], weights.album.compatible[1]);
      }
    }
  }

  // 5. Version Penalties & Hard Rejections
  const appliedPenalties: AppliedPenalty[] = [];
  let hardRejected = false;
  let rejectionReason: string | undefined;

  // Major artist mismatch hard reject
  if (artistScore <= weights.artist.majorMismatchPenalty) {
    hardRejected = true;
    rejectionReason = `Major artist mismatch: Spotify artist '${normSpotify.rawArtist}' does not match YouTube artist '${normCandidate.rawArtist}'`;
  }

  // Version conflict checks
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

  const totalPenalties = appliedPenalties.reduce((sum, p) => sum + p.points, 0);

  // Positive raw score
  const positiveScore = titleScore + Math.max(0, artistScore) + durationScore + albumScore;
  const rawFinalScore = positiveScore + totalPenalties + (artistScore < 0 ? artistScore : 0);
  const finalScore = Math.max(0, Math.min(100, rawFinalScore));

  // Determine Confidence
  let confidence: MatchConfidence = 'reject';
  if (finalScore >= weights.thresholds.excellent) confidence = 'excellent';
  else if (finalScore >= weights.thresholds.strong) confidence = 'strong';
  else if (finalScore >= weights.thresholds.acceptable) confidence = 'acceptable';
  else if (finalScore >= weights.thresholds.weak) confidence = 'weak';
  else confidence = 'reject';

  const matched = !hardRejected && finalScore >= weights.thresholds.autoMatch;

  if (!matched && !rejectionReason) {
    if (finalScore < weights.thresholds.autoMatch) {
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
      album: albumScore,
      penalties: totalPenalties,
    },
    appliedPenalties,
    rejectionReason,
    hardRejected,
    normalizedSpotifyTitle: normSpotify.identityTitle,
    normalizedCandidateTitle: normCandidate.identityTitle,
    normalizedSpotifyArtist: normSpotify.primaryArtist,
    normalizedCandidateArtist: normCandidate.primaryArtist,
    detectedSpotifyVersion: spotifyVersion,
    detectedCandidateVersion: candidateVersion,
  };
}

export function rankAndBreakTieCandidates(candidates: ScoredMatchCandidate[]): ScoredMatchCandidate[] {
  return [...candidates].sort((a, b) => {
    // 1. Matched over non-matched
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    // 2. Score descending
    if (b.score !== a.score) return b.score - a.score;
    // 3. Artist score descending
    if (b.breakdown.artist !== a.breakdown.artist) return b.breakdown.artist - a.breakdown.artist;
    // 4. Title score descending
    if (b.breakdown.title !== a.breakdown.title) return b.breakdown.title - a.breakdown.title;
    // 5. Duration score descending
    if (b.breakdown.duration !== a.breakdown.duration) return b.breakdown.duration - a.breakdown.duration;
    // 6. Version compatibility (fewer penalties)
    if (a.breakdown.penalties !== b.breakdown.penalties) return b.breakdown.penalties - a.breakdown.penalties;
    // 7. Album score descending
    return b.breakdown.album - a.breakdown.album;
  });
}
