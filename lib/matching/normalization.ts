/**
 * lib/matching/normalization.ts
 *
 * Robust normalization pipeline for track titles, artists, and albums.
 * Handles Unicode NFKC, case folding, punctuation, featured artists,
 * and non-identity noise stripping while preserving version indicators.
 */

import { transliterate } from 'transliteration';

export interface NormalizedMetadata {
  rawTitle: string;
  rawArtist: string;
  rawAlbum?: string;
  cleanTitle: string;
  identityTitle: string;
  primaryArtist: string;
  featuredArtists: string[];
  allArtists: string[];
  cleanAlbum: string;
  titleTokens: string[];
  primaryArtistTokens: string[];
  allArtistTokens: string[];
  albumTokens: string[];
}

const NON_IDENTITY_MARKERS = [
  /\b(official\s+music\s+video|official\s+video|official\s+audio|official\s+visualizer|official\s+lyric\s+video|official\s+lyrics?)\b/gi,
  /\b(music\s+video|lyric\s+video|lyrics?\s+video|visualizer|lyrics?|audio|video|topic|full\s+audio|full\s+video|hq|hd|4k|m\/v)\b/gi,
  /\b(album\s+version|original\s+mix|original\s+version)\b/gi,
];

const FEATURED_ARTIST_PATTERNS = [
  /\b(?:feat\.?|ft\.?|featuring|with)\s+([^()[\]{}]+)/gi,
  /\((?:feat\.?|ft\.?|featuring|with)\s+([^)]+)\)/gi,
  /\[(?:feat\.?|ft\.?|featuring|with)\s+([^\]]+)\]/gi,
];

export function cleanString(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[–—−-]/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[&|/\\_:;,."!?+*#@~^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractFeaturedArtistsFromTitle(title: string): { baseTitle: string; featured: string[] } {
  let baseTitle = title;
  const featured: string[] = [];

  for (const pattern of FEATURED_ARTIST_PATTERNS) {
    baseTitle = baseTitle.replace(pattern, (_match, group) => {
      if (group && typeof group === 'string') {
        const split = group.split(/[,&/]/).map((s) => cleanString(s)).filter(Boolean);
        featured.push(...split);
      }
      return ' ';
    });
  }

  return { baseTitle: baseTitle.trim(), featured };
}

export function extractArtists(artistStr: string): { primary: string; featured: string[]; all: string[] } {
  const cleaned = cleanString(artistStr);
  if (!cleaned) return { primary: '', featured: [], all: [] };

  // Split on featured or common separators
  const parts = artistStr
    .split(/\b(?:feat\.?|ft\.?|featuring|with)\b|[,&/]/i)
    .map((p) => cleanString(p))
    .filter(Boolean);

  if (parts.length === 0) return { primary: cleaned, featured: [], all: [cleaned] };

  const primary = parts[0];
  const featured = parts.slice(1);
  const all = Array.from(new Set([primary, ...featured]));

  return { primary, featured, all };
}

export function stripNonIdentityMarkers(title: string): string {
  let result = title;
  for (const pattern of NON_IDENTITY_MARKERS) {
    result = result.replace(pattern, ' ');
  }
  return cleanString(result);
}

export function tokenize(value: string): string[] {
  return cleanString(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

export function tokenSimilarity(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function stripArtistPrefixFromTitle(title: string, artist: string): string {
  const cleanA = cleanString(artist);
  if (!cleanA) return title;
  const cleanT = cleanString(title);
  if (cleanT.startsWith(cleanA)) {
    const after = cleanT.slice(cleanA.length).trim();
    return after.replace(/^[–—−-]\s*/, '').trim() || title;
  }
  return title;
}

export function stringSimilarity(a: string, b: string): number {
  const cleanA = cleanString(a);
  const cleanB = cleanString(b);
  if (!cleanA || !cleanB) return 0;
  if (cleanA === cleanB) return 1.0;

  const tokensA = tokenize(cleanA);
  const tokensB = tokenize(cleanB);
  const jaccard = tokenSimilarity(tokensA, tokensB);

  // If there is zero word/token overlap and neither is a substring of the other, similarity is 0
  const isSubstring = cleanA.includes(cleanB) || cleanB.includes(cleanA);
  if (jaccard === 0 && !isSubstring) {
    return 0;
  }

  // Levenshtein distance ratio
  const maxLen = Math.max(cleanA.length, cleanB.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(cleanA, cleanB);
  const levRatio = Math.max(0, 1 - dist / maxLen);

  return Math.max(jaccard, levRatio * 0.9 + jaccard * 0.1);
}

function levenshtein(s: string, t: string): number {
  const m = s.length;
  const n = t.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[m][n];
}

export function normalizeTrack(input: { title: string; artist: string; album?: string }): NormalizedMetadata {
  const rawTitle = input.title || '';
  const rawArtist = input.artist || '';
  const rawAlbum = input.album || '';

  const { baseTitle: titleWithoutFeat, featured: titleFeatured } = extractFeaturedArtistsFromTitle(rawTitle);
  const { primary: artistPrimary, featured: artistFeatured, all: allArtistsList } = extractArtists(rawArtist);

  const baseTitle = stripArtistPrefixFromTitle(titleWithoutFeat, artistPrimary);

  const allFeatured = Array.from(new Set([...titleFeatured, ...artistFeatured]));
  const allArtists = Array.from(new Set([artistPrimary, ...allFeatured, ...allArtistsList])).filter(Boolean);

  const cleanTitle = cleanString(baseTitle);
  const identityTitle = stripNonIdentityMarkers(baseTitle);
  const cleanAlbum = cleanString(rawAlbum);

  return {
    rawTitle,
    rawArtist,
    rawAlbum,
    cleanTitle,
    identityTitle,
    primaryArtist: artistPrimary,
    featuredArtists: allFeatured,
    allArtists,
    cleanAlbum,
    titleTokens: tokenize(identityTitle),
    primaryArtistTokens: tokenize(artistPrimary),
    allArtistTokens: tokenize(allArtists.join(' ')),
    albumTokens: tokenize(cleanAlbum),
  };
}
