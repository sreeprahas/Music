import { NextRequest, NextResponse } from 'next/server';
import { getSavedLyrics, saveLyrics } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LrclibResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  duration: number;
}

interface MusixmatchResult {
  message?: {
    header?: { status_code?: number };
    body?: { lyrics?: { lyrics_body?: string } };
  };
}

// Shared timeout for all external fetch calls — 5 seconds max
const FETCH_TIMEOUT_MS = 5000;

function timedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

export async function GET(request: NextRequest) {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return NextResponse.json({ syncedLyrics: null, plainLyrics: null });
  }

  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') ?? '';
  const artist = searchParams.get('artist') ?? '';

  if (!title || title.length > 200 || artist.length > 200) {
    return NextResponse.json({ error: 'Missing title' }, { status: 400 });
  }

  // 1. Check local cache first — no network needed
  const cached = getSavedLyrics(artist, title);
  if (cached) return NextResponse.json(cached);

  // 2. Fetch from external APIs with abort timeouts
  const lrclibResult = await fetchFromLrclib(title, artist);
  if (lrclibResult && (lrclibResult.syncedLyrics || lrclibResult.plainLyrics)) {
    saveLyrics(artist, title, lrclibResult);
    return NextResponse.json(lrclibResult);
  }

  const lyricaResult = await fetchFromLyrica(title, artist);
  if (lyricaResult && lyricaResult.syncedLyrics) {
    saveLyrics(artist, title, lyricaResult);
    return NextResponse.json(lyricaResult);
  }

  const musixmatchResult = await fetchFromMusixmatch(title, artist);
  if (musixmatchResult) {
    saveLyrics(artist, title, musixmatchResult);
    return NextResponse.json(musixmatchResult);
  }

  return NextResponse.json({ syncedLyrics: null, plainLyrics: null, notFound: true });
}

async function fetchFromLyrica(title: string, artist: string) {
  const baseUrl = process.env.LYRICA_API_URL || 'https://lyrica-api.vercel.app';
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/lyrics?track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&synced=true`;
    const res = await timedFetch(url, {
      headers: { 'User-Agent': 'YTMusicPersonal/1.0.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const synced = data.syncedLyrics || data.lrc || data.lyrics || null;
    if (typeof synced === 'string' && /\[\d{2}:\d{2}/.test(synced)) {
      return { syncedLyrics: synced, plainLyrics: null, trackName: title, artistName: artist };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchFromLrclib(title: string, artist: string) {
  try {
    const headers = { 'Lrclib-Client': 'YTMusicPersonal/1.0.0' };
    const directUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const directRes = await timedFetch(directUrl, { headers });

    if (directRes.ok) {
      const data: LrclibResult = await directRes.json();
      if (data.syncedLyrics || data.plainLyrics) {
        return {
          syncedLyrics: data.syncedLyrics ?? null,
          plainLyrics: data.plainLyrics ?? null,
          trackName: data.trackName,
          artistName: data.artistName,
        };
      }
    }

    const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const searchRes = await timedFetch(searchUrl, { headers });
    if (!searchRes.ok) return null;

    const results: LrclibResult[] = await searchRes.json();
    const best = results.find((r) => r.syncedLyrics) ?? results.find((r) => r.plainLyrics) ?? null;
    if (!best) return null;

    return {
      syncedLyrics: best.syncedLyrics ?? null,
      plainLyrics: best.plainLyrics ?? null,
      trackName: best.trackName,
      artistName: best.artistName,
    };
  } catch {
    return null;
  }
}

async function fetchFromMusixmatch(title: string, artist: string) {
  const apiKey = process.env.MUSIXMATCH_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL('https://api.musixmatch.com/ws/1.1/matcher.lyrics.get');
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('q_track', title);
    url.searchParams.set('q_artist', artist);

    const res = await timedFetch(url.toString());
    if (!res.ok) return null;

    const data = (await res.json()) as MusixmatchResult;
    const body = data.message?.body?.lyrics?.lyrics_body?.trim();
    if (!body) return null;

    return {
      syncedLyrics: null,
      plainLyrics: body.replace(/\n\n.*?Lyrics powered by www\.musixmatch\.com[\s\S]*$/i, '').trim(),
      trackName: title,
      artistName: artist,
    };
  } catch {
    return null;
  }
}
