import { normalizeMetadata, tokenSimilarity } from './normalization';
import { classifyVersion, versionsCompatible, type TrackVersion } from './version';
import type { YouTubeCandidate } from '@/lib/youtube/graphql-client';

export interface MatchTarget {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

export interface ScoredCandidate extends YouTubeCandidate {
  score: number;
  titleSimilarity: number;
  artistSimilarity: number;
  durationSimilarity: number;
  version: TrackVersion;
}

export function scoreCandidate(candidate: YouTubeCandidate, target: MatchTarget, sourceVersion: TrackVersion): ScoredCandidate {
  const source = normalizeMetadata(target);
  const candidateMeta = normalizeMetadata({ title: candidate.title, artist: candidate.channel || '', album: candidate.album });
  const titleSimilarity = Math.max(tokenSimilarity(source.titleTokens, candidateMeta.titleTokens), tokenSimilarity(source.titleTokens, candidateMeta.allTokens));
  const artistSimilarity = tokenSimilarity(source.artistTokens, candidateMeta.artistTokens.length ? candidateMeta.artistTokens : candidateMeta.allTokens);
  const durationSimilarity = target.duration && candidate.duration ? Math.max(0, 1 - Math.abs(target.duration - candidate.duration) / Math.max(target.duration, candidate.duration)) : 0;
  const version = classifyVersion(candidate.title);
  const versionScore = versionsCompatible(sourceVersion, version) ? 1 : 0;
  const nativeScore = target.title === candidate.title ? 1 : 0;
  const albumScore = source.album && candidate.album ? tokenSimilarity(normalizeMetadata({ title: source.album, artist: '' }).titleTokens, normalizeMetadata({ title: candidate.album, artist: '' }).titleTokens) : 0;
  const score = artistSimilarity * 30 + titleSimilarity * 30 + durationSimilarity * 15 + versionScore * 10 + nativeScore * 5 + albumScore * 3 + Math.max(0, 2 - Number(candidate.relevance || 0) * 0.1);
  return { ...candidate, score, titleSimilarity, artistSimilarity, durationSimilarity, version };
}
