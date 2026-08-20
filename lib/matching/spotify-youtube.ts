import type { MatchRecord, Track } from '@/types';
import { cacheKey } from '@/lib/cache/keys';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { searchYouTubeMusic } from '@/lib/youtube/search';
import { compareArtwork } from './artwork';
import { diagnostic } from './diagnostics';
import { hasNativeScript, normalizeMetadata } from './normalization';
import { scoreCandidate } from './scoring';
import { classifyVersion, isDurationVariant, isForbiddenForNormal, versionsCompatible } from './version';
import type { YouTubeCandidate } from '@/lib/youtube/graphql-client';

export interface MatchResult { videoId: string | null; record: MatchRecord; }

export async function matchSpotifyTrack(track: { title: string; artist: string; album?: string; duration?: number; thumbnailUrl?: string; spotifyId?: string }): Promise<MatchResult> {
  if (!track.spotifyId) return { videoId: null, record: noMatch('', track, [diagnostic('missing_spotify_id')]) };
  const override = getPersistent<{ videoId: string }>(cacheKey.override(track.spotifyId));
  if (override?.videoId) return { videoId: override.videoId, record: { ...baseRecord(track), youtubeVideoId: override.videoId, matchMethod: 'manual_override' } };
  const cached = getPersistent<MatchRecord>(cacheKey.match(track.spotifyId));
  if (cached && cached.youtubeVideoId) return { videoId: cached.youtubeVideoId, record: cached };

  const source = normalizeMetadata(track);
  const sourceVersion = classifyVersion(source.versionText);
  const diagnostics = [];
  const queries = buildQueries(track.title, track.artist, source, hasNativeScript(track.title) || hasNativeScript(track.artist));
  let candidates: YouTubeCandidate[] = [];
  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const found = await searchYouTubeMusic(query, 20);
    candidates.push(...found);
    const valid = evaluateCandidates(found, track, sourceVersion, diagnostics);
    if (valid.length) return persistMatch(track, valid[0].videoId, 'metadata', valid[0].score, diagnostics);
    if (index === 1 && hasNativeScript(track.title + track.artist)) diagnostics.push(diagnostic('native_script_failed'));
  }
  candidates = dedupe(candidates);
  if (!candidates.length) diagnostics.push(diagnostic('no_candidates'));
  else diagnostics.push(diagnostic('all_candidates_rejected'));

  if (track.thumbnailUrl) {
    diagnostics.push(diagnostic('artwork_fallback_attempted'));
    for (const candidate of candidates.slice(0, 20)) {
      for (const artwork of candidate.thumbnails || []) {
        const compared = await compareArtwork(track.thumbnailUrl, artwork);
        if (compared.strong) return persistMatch(track, candidate.videoId, 'artwork_fallback', 0, diagnostics);
      }
    }
    diagnostics.push(diagnostic('artwork_similarity_too_low'));
  }
  diagnostics.push(diagnostic('artwork_fallback_failed'));
  return { videoId: null, record: noMatch(track.spotifyId, track, diagnostics) };
}

export function saveManualOverride(spotifyTrackId: string, videoId: string): void {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID');
  setPersistent(cacheKey.override(spotifyTrackId), { videoId }, 0);
  setPersistent(cacheKey.match(spotifyTrackId), { spotifyTrackId, youtubeVideoId: videoId, matchMethod: 'manual_override', diagnostics: [], matchedAt: Date.now() }, 0);
}

function buildQueries(title: string, artist: string, metadata: ReturnType<typeof normalizeMetadata>, native: boolean): string[] {
  const nativeQueries = [`${artist} ${title}`, `${title} ${artist}`];
  const romanized = [`${metadata.romanizedArtist} ${metadata.romanizedTitle}`, `${metadata.romanizedTitle} ${metadata.romanizedArtist}`];
  return native ? [...nativeQueries, ...romanized] : [...nativeQueries, ...romanized];
}

function evaluateCandidates(candidates: YouTubeCandidate[], track: Pick<Track, 'title' | 'artist' | 'album' | 'duration'>, sourceVersion: ReturnType<typeof classifyVersion>, diagnostics: ReturnType<typeof diagnostic>[]) {
  return candidates.map((candidate) => {
    const version = classifyVersion(candidate.title);
    if (sourceVersion === 'studio' && isForbiddenForNormal(version)) { diagnostics.push(diagnostic('version_mismatch', 'Candidate has an incompatible version', undefined, candidate.videoId)); return null; }
    if (!versionsCompatible(sourceVersion, version)) { diagnostics.push(diagnostic('version_mismatch', undefined, undefined, candidate.videoId)); return null; }
    if (track.duration && candidate.duration) {
      const difference = Math.abs(track.duration - candidate.duration);
      const allowed = isDurationVariant(sourceVersion) ? Math.max(30, track.duration * 0.25) : 3;
      const ratioOk = isDurationVariant(sourceVersion) ? candidate.duration >= track.duration * 0.5 && candidate.duration <= track.duration * 1.75 : true;
      if (difference > allowed || !ratioOk) { diagnostics.push(diagnostic('duration_mismatch', undefined, { difference, allowed }, candidate.videoId)); return null; }
    }
    const scored = scoreCandidate(candidate, track, sourceVersion);
    if (scored.artistSimilarity < 0.35) { diagnostics.push(diagnostic('artist_mismatch', undefined, undefined, candidate.videoId)); return null; }
    if (scored.titleSimilarity < 0.45) { diagnostics.push(diagnostic('title_mismatch', undefined, undefined, candidate.videoId)); return null; }
    return scored.score >= 55 ? scored : null;
  }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)).sort((a, b) => b.score - a.score);
}

function persistMatch(track: Pick<Track, 'title' | 'artist' | 'duration' | 'spotifyId'>, videoId: string, method: MatchRecord['matchMethod'], score: number, diagnostics: ReturnType<typeof diagnostic>[]): MatchResult {
  const record: MatchRecord = { ...baseRecord(track), youtubeVideoId: videoId, matchMethod: method, score, diagnostics, matchedAt: Date.now() };
  if (track.spotifyId) setPersistent(cacheKey.match(track.spotifyId), record, 0);
  return { videoId, record };
}

function noMatch(id: string, track: Pick<Track, 'title' | 'artist' | 'duration'>, diagnostics: ReturnType<typeof diagnostic>[]): MatchRecord {
  return { spotifyTrackId: id, youtubeVideoId: null, matchMethod: 'no_match', diagnostics, matchedAt: Date.now(), sourceTitle: track.title, sourceArtist: track.artist, sourceDuration: track.duration };
}

function baseRecord(track: Pick<Track, 'title' | 'artist' | 'duration' | 'spotifyId'>): MatchRecord {
  return { spotifyTrackId: track.spotifyId || '', youtubeVideoId: null, matchMethod: 'no_match', diagnostics: [], matchedAt: Date.now(), sourceTitle: track.title, sourceArtist: track.artist, sourceDuration: track.duration };
}

function dedupe(candidates: YouTubeCandidate[]): YouTubeCandidate[] { return [...new Map(candidates.map((candidate) => [candidate.videoId, candidate])).values()]; }
