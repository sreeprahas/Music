import { Innertube, UniversalCache } from 'youtubei.js'; let youtubePromise: Promise<Innertube> | null = null; async function getYouTube(): Promise<Innertube> { if (!youtubePromise) { youtubePromise = Innertube.create({ lang: 'en', location: 'US', generate_session_locally: true, enable_session_cache: true, cache: new UniversalCache(true), }).catch((error) => { youtubePromise = null; throw error; }); } return youtubePromise; } export interface YouTubeSearchItem { videoId: string; title: string; artist: string; duration?: number; thumbnailUrl: string; } function text(value: unknown): string { if (!value) return ''; if (typeof value === 'string') { return value; } if (typeof value === 'object') { const obj = value as Record<string, unknown>; if (typeof obj.text === 'string') { return obj.text; } if (typeof obj.simpleText === 'string') { return obj.simpleText; } if (Array.isArray(obj.runs)) { return obj.runs .map((run) => { if (!run || typeof run !== 'object') return ''; const value = (run as Record<string, unknown>).text; return typeof value === 'string' ? value : ''; }) .join(''); } } return ''; } function parseDuration(value: unknown): number | undefined { const raw = text(value).trim(); if (!raw) { return undefined; } const parts = raw.split(':').map(Number); if (parts.some((part) => !Number.isFinite(part))) { return undefined; } if (parts.length === 2) { return parts[0] * 60 + parts[1]; } if (parts.length === 3) { return ( parts[0] * 3600 + parts[1] * 60 + parts[2] ); } return undefined; } function thumbnailFrom(video: any, videoId: string): string { const thumbnails = video?.thumbnails ?? video?.thumbnail?.thumbnails ?? []; if (Array.isArray(thumbnails) && thumbnails.length) { const last = thumbnails[thumbnails.length - 1]; if (typeof last?.url === 'string') { return last.url; } } return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`; } function artistFrom(video: any): string { const author = video?.author?.name ?? video?.author?.text ?? video?.owner?.name; if (typeof author === 'string' && author.trim()) { return author.trim(); } const artists = video?.artists; if (Array.isArray(artists) && artists.length) { const names = artists .map((artist: any) => typeof artist === 'string' ? artist : artist?.name, ) .filter(Boolean); if (names.length) { return names.join(', '); } } return 'Unknown Artist'; } export async function searchYouTubeMusic(
  query: string,
  signal?: AbortSignal,
): Promise<YouTubeSearchItem[]> {
  if (signal?.aborted) throw new Error('Search cancelled');

  const youtube = await getYouTube();

  if (signal?.aborted) throw new Error('Search cancelled');

  // IMPORTANT: this is deliberately YouTube Music-only. We do not use the
  // generic YouTube search endpoint for Spotify -> YouTube matching.
  const result: any = await youtube.music.search(query.trim(), { type: 'song' });

  if (signal?.aborted) throw new Error('Search cancelled');

  const rawSongs: any[] = Array.isArray(result?.songs?.contents)
    ? result.songs.contents
    : Array.isArray(result?.songs)
      ? result.songs
      : [];

  const output: YouTubeSearchItem[] = [];

  for (const song of rawSongs) {
    const videoId = song?.id ?? song?.video_id ?? song?.endpoint?.payload?.videoId;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;

    const title = text(song?.title ?? song?.name).trim();
    if (!title) continue;

    const artistNames = Array.isArray(song?.artists)
      ? song.artists
          .map((artist: any) => text(artist?.name ?? artist))
          .filter(Boolean)
      : [];

    const artist = artistNames.join(', ') ||
      text(song?.artist ?? song?.author?.name ?? song?.author?.text) ||
      'Unknown Artist';

    const thumbnailUrl = thumbnailFrom(song, videoId);
    const duration =
      parseDuration(song?.duration) ??
      parseDuration(song?.duration_text) ??
      parseDuration(song?.length_text);

    output.push({
      videoId,
      title,
      artist,
      duration,
      thumbnailUrl,
    });
  }

  return output;
}

export async function getYouTubeInfo( videoId: string, signal?: AbortSignal, ): Promise<any> { if (signal?.aborted) { throw new Error('Request cancelled'); } if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) { throw new Error('Invalid YouTube video ID'); } const youtube = await getYouTube(); if (signal?.aborted) { throw new Error('Request cancelled'); } return youtube.getInfo(videoId); } export async function getYouTubeAudioStream( videoId: string, signal?: AbortSignal, ): Promise<{ url: string; mimeType?: string; bitrate?: number; expiresAt?: number; }> { const info: any = await getYouTubeInfo( videoId, signal, ); if (signal?.aborted) { throw new Error('Request cancelled'); } /* * IMPORTANT: * * Do not inspect streaming_data[].url directly. * * youtubei.js 17.x represents some formats with cipher/ * signature information. Format.decipher() is the library's * intended URL-resolution interface. */ const audioFormats = (info.streaming_data?.adaptive_formats ?? []) .filter((format: any) => { const mime = format?.mime_type ?? ''; return ( format?.has_audio === true || ( typeof mime === 'string' && mime.startsWith('audio/') ) ); }); if (!audioFormats.length) { throw new Error( 'No audio formats were returned by YouTube', ); } /* * Prefer Opus 251 when available. * Otherwise choose the highest-bitrate audio format. */ audioFormats.sort( (a: any, b: any) => { const aItag = Number(a?.itag ?? 0); const bItag = Number(b?.itag ?? 0); if (aItag === 251 && bItag !== 251) { return -1; } if (bItag === 251 && aItag !== 251) { return 1; } return ( Number(b?.bitrate ?? 0) - Number(a?.bitrate ?? 0) ); }, ); const selected = audioFormats[0]; /* * Use youtubei.js's own Format.decipher() * implementation rather than manually constructing * a URL from cipher/signatureCipher. */ const url = await selected.decipher( info.actions.session.player, ); if ( typeof url !== 'string' || !url ) { throw new Error( 'youtubei.js could not resolve the audio URL', ); } const expires = Number( (() => { try { return new URL(url) .searchParams .get('expire'); } catch { return null; } })(), ); return { url, mimeType: selected.mime_type, bitrate: Number(selected.bitrate) || undefined, expiresAt: Number.isFinite(expires) && expires > 0 ? expires * 1000 : Date.now() + 30 * 60 * 1000, }; } export function clearYouTubeClient(): void { youtubePromise = null; }