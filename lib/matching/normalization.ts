import { transliterate } from 'transliteration';

export interface NormalizedMetadata {
  title: string;
  artist: string;
  album: string;
  titleTokens: string[];
  artistTokens: string[];
  allTokens: string[];
  romanizedTitle: string;
  romanizedArtist: string;
  versionText: string;
}

export function normalizeMetadata(input: { title: string; artist: string; album?: string }): NormalizedMetadata {
  const title = clean(input.title);
  const artist = clean(input.artist);
  const album = clean(input.album || '');
  const versionText = `${title} ${album}`;
  return {
    title,
    artist,
    album,
    titleTokens: tokens(title),
    artistTokens: tokens(artist),
    allTokens: [...new Set([...tokens(title), ...tokens(artist)])],
    romanizedTitle: clean(transliterate(input.title || '')),
    romanizedArtist: clean(transliterate(input.artist || '')),
    versionText,
  };
}

export function clean(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[()[\]{}]/g, ' ').replace(/[&|/\\_:;,]+/g, ' ').replace(/[–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokens(value: string): string[] {
  return clean(value).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0);
}

export function tokenSimilarity(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function hasNativeScript(value: string): boolean {
  const letters = [...value].filter((char) => /\p{L}/u.test(char));
  return letters.length > 0 && letters.some((char) => !/\p{Script=Latin}/u.test(char));
}
