/**
 * yt-dlp resolver — search YouTube and score candidates to find the best match
 * for a given track's metadata.
 *
 * This is the media-resolution layer. Spotify provides "what song is this?";
 * this module answers "where can I obtain/play the corresponding media?".
 *
 * Security: yt-dlp is invoked via `execFile` with an argument ARRAY — never
 * shell string interpolation. User-controlled values (titles, artists) are
 * passed as individual arguments, eliminating shell injection risk.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import type { Track } from '@/types';
import { YouTubeResolutionError } from '../spotify/errors';

const execFileAsync = promisify(execFile);

/** Shared yt-dlp executable discovery (mirrors lib/downloader.ts). */
export function getYtdlpPath(): string {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) return process.env.YTDLP_PATH;
  const bundled = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(bundled) ? bundled : 'yt-dlp';
}

/** A YouTube search candidate returned by yt-dlp. */
export interface YouTubeCandidate {
  videoId: string;
  title: string;
  channel?: string;
  duration?: number;
  viewCount?: number;
  /** Computed match score (higher = better). */
  score: number;
}

/** Normalize a string for fuzzy comparison (lowercase, trim, collapse spaces). */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Levenshtein distance for short-string similarity. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/** Similarity ratio 0..1 based on Levenshtein distance. */
function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/** Penalty multipliers for undesirable result types. */
const PENALTIES = {
  remix: 0.7,
  cover: 0.6,
  live: 0.7,
  karaoke: 0.3,
  nightcore: 0.3,
  slowed: 0.6,
  reverb: 0.6,
  instrumental: 0.4,
  piano: 0.5,
  '8d': 0.3,
  reaction: 0.2,
  lyrics: 0.5,
  'music video': 1.0, // official MVs are good
  official: 1.1, // official audio/video is good
  audio: 1.0,
};

/** Score a single candidate against the target track metadata. */
export function scoreCandidate(candidate: YouTubeCandidate, target: { title: string; artist: string; duration?: number }): number {
  let score = 0;

  // Title similarity (most important — 0..50 points)
  const titleSim = similarity(candidate.title, target.title);
  score += titleSim * 50;

  // Artist presence in title or channel (0..20 points)
  const targetArtist = normalize(target.artist);
  const candidateText = normalize(`${candidate.title} ${candidate.channel || ''}`);
  if (targetArtist && candidateText.includes(targetArtist)) {
    score += 20;
  } else {
    // Partial artist match
    const artistWords = targetArtist.split(' ').filter((w) => w.length > 2);
    const matched = artistWords.filter((w) => candidateText.includes(w)).length;
    score += (matched / Math.max(1, artistWords.length)) * 20;
  }

  // Duration match (0..15 points) — within 5 seconds is full marks
  if (target.duration && candidate.duration) {
    const diff = Math.abs(target.duration - candidate.duration);
    if (diff <= 5) score += 15;
    else if (diff <= 15) score += 10;
    else if (diff <= 30) score += 5;
    else score -= Math.min(10, (diff - 30) / 10);
  }

  // Penalty/bonus for keywords in the candidate title
  const candidateTitleLower = candidate.title.toLowerCase();
  for (const [keyword, multiplier] of Object.entries(PENALTIES)) {
    if (candidateTitleLower.includes(keyword)) {
      score *= multiplier;
      break; // apply only the strongest matching penalty
    }
  }

  // View count tiebreaker (log scale — 0..5 bonus points)
  if (candidate.viewCount && candidate.viewCount > 0) {
    score += Math.min(5, Math.log10(candidate.viewCount) / 2);
  }

  return score;
}

/** Search YouTube via yt-dlp and return scored candidates. */
export async function searchYouTube(query: string, limit = 5): Promise<YouTubeCandidate[]> {
  // SECURITY: execFile with argument array — no shell interpolation.
  const { stdout } = await execFileAsync(
    getYtdlpPath(),
    [
      '--flat-playlist', '--dump-single-json', '--no-warnings', '--skip-download',
      `--playlist-end`, String(limit),
      `ytsearch${limit}:${query}`,
    ],
    { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
  );

  const data = JSON.parse(stdout);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries.map((entry: any) => ({
    videoId: String(entry.id || ''),
    title: String(entry.title || ''),
    channel: String(entry.uploader || entry.channel || ''),
    duration: Number(entry.duration) || undefined,
    viewCount: Number(entry.view_count) || undefined,
    score: 0,
  })).filter((c: YouTubeCandidate) => c.videoId);
}

/**
 * Resolve a track to the best-matching YouTube video.
 * Returns the videoId of the highest-scoring candidate, or null if no good match.
 */
export async function resolveTrack(track: Pick<Track, 'title' | 'artist' | 'duration'>): Promise<string | null> {
  const query = `${track.artist} ${track.title}`.trim();
  if (!query) return null;

  let candidates: YouTubeCandidate[];
  try {
    candidates = await searchYouTube(query, 5);
  } catch (err) {
    throw new YouTubeResolutionError(
      err instanceof Error ? `YouTube search failed: ${err.message}` : 'YouTube search failed',
    );
  }

  if (!candidates.length) return null;

  // Score and sort
  const scored = candidates
    .map((c) => ({ ...c, score: scoreCandidate(c, track) }))
    .sort((a, b) => b.score - a.score);

  // Reject if the best score is too low (likely a bad match)
  if (scored[0].score < 20) return null;

  return scored[0].videoId;
}

/** Resolve a track by its known YouTube video ID (no search needed). */
export function resolveVideo(videoId: string): string {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new YouTubeResolutionError(`Invalid YouTube video ID: ${videoId}`);
  }
  return videoId;
}
