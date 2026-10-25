import path from 'node:path';
import fs from 'node:fs';

/** Typed subset of SpotiFLAC's public /api/v1 contract used by this app. */
export interface SpotiFLACInfo {
  version?: string;
  multiuser?: boolean;
  authenticated?: boolean;
}

export interface SpotiFLACTrack {
  id?: string;
  url?: string;
  title?: string;
  name?: string;
  artists?: string[] | string;
  artist?: string;
  album?: string | { title?: string; name?: string; artist?: string };
  duration?: number;
  duration_ms?: number;
  isrc?: string;
  explicit?: boolean;
  track_number?: number;
  disc_number?: number;
  artwork?: string;
  image?: string;
  provider?: string;
  format?: string;
  quality?: string;
  status?: string;
}

export interface SpotiFLACJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
  url?: string;
  error?: string;
  tracks?: SpotiFLACTrack[];
  output_path?: string;
}

export interface MusicTrack {
  id: string;
  spotifyId: string;
  title: string;
  artists: string[];
  album: string;
  duration: number;
  trackNumber?: number;
  discNumber?: number;
  releaseDate?: string;
  isrc?: string;
  explicit?: boolean;
  artwork?: string;
  format?: string;
  quality?: string;
  provider?: string;
  spotifyUrl: string;
}

export type MusicErrorCode = 'SPOTIFLAC_UNAVAILABLE' | 'TRACK_NOT_FOUND' | 'PROVIDER_UNAVAILABLE' | 'DOWNLOAD_FAILED' | 'AUTHENTICATION_FAILED' | 'RATE_LIMITED' | 'TIMEOUT' | 'SPOTIFLAC_ERROR';

export class MusicServiceError extends Error {
  constructor(readonly code: MusicErrorCode, message: string, readonly status?: number) {
    super(message);
    this.name = 'MusicServiceError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
let outputDirectory: string | null = null;

export function getSpotiFLACOutputDir(): string {
  if (outputDirectory) return outputDirectory;
  const configured = process.env.SPOTIFLAC_CACHE_DIR?.trim();
  if (!configured) throw new Error('SPOTIFLAC_CACHE_DIR must point to the shared SpotiFLAC output directory.');
  outputDirectory = path.resolve(configured);
  fs.mkdirSync(outputDirectory, { recursive: true });
  return outputDirectory;
}

function trackOutputPath(title: string): string {
  const safeTitle = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 180);
  if (!safeTitle) throw new MusicServiceError('TRACK_NOT_FOUND', 'A valid track title is required for a deterministic output path.');
  return path.join(getSpotiFLACOutputDir(), `${safeTitle}.flac`);
}

function config() {
  const base = (process.env.SPOTIFLAC_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const token = process.env.SPOTIFLAC_API_KEY || '';
  const timeout = Number(process.env.SPOTIFLAC_TIMEOUT || DEFAULT_TIMEOUT_MS);
  return { base, token, timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS };
}

function spotifyTrackUrl(idOrUrl: string): string {
  const value = idOrUrl.trim();
  if (/^https:\/\/open\.spotify\.com\/(track|album|playlist|artist)\//i.test(value)) return value;
  if (/^[A-Za-z0-9]{22}$/.test(value)) return `https://open.spotify.com/track/${value}`;
  throw new MusicServiceError('TRACK_NOT_FOUND', 'A valid Spotify URL or track ID is required.');
}

function mapTrack(raw: SpotiFLACTrack): MusicTrack {
  const spotifyId = raw.id || raw.url?.match(/(?:track|album|playlist|artist)\/([A-Za-z0-9]{22})/)?.[1] || '';
  const artistValue = raw.artists ?? raw.artist ?? [];
  const artists = Array.isArray(artistValue) ? artistValue.map(String) : String(artistValue).split(/,\s*/).filter(Boolean);
  const albumValue = raw.album;
  return {
    id: spotifyId,
    spotifyId,
    title: raw.title || raw.name || 'Unknown title',
    artists,
    album: typeof albumValue === 'string' ? albumValue : albumValue?.title || albumValue?.name || '',
    duration: typeof raw.duration_ms === 'number' ? Math.round(raw.duration_ms / 1000) : raw.duration || 0,
    trackNumber: raw.track_number,
    discNumber: raw.disc_number,
    isrc: raw.isrc,
    explicit: raw.explicit,
    artwork: raw.artwork || raw.image,
    format: raw.format,
    quality: raw.quality,
    provider: raw.provider,
    spotifyUrl: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : (raw.url || ''),
  };
}

async function request<T>(route: string, init: RequestInit = {}): Promise<T> {
  const { base, token, timeout } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('SpotiFLAC request timed out')), timeout);
  const external = init.signal;
  const abortFromExternal = () => controller.abort(external?.reason);
  external?.addEventListener('abort', abortFromExternal, { once: true });
  try {
    const url = new URL(`${base}/api/v1/${route.replace(/^\//, '')}`);
    if (token) url.searchParams.set('token', token);
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers },
      cache: 'no-store',
    });
    if (!response.ok) {
      let detail = `SpotiFLAC returned HTTP ${response.status}`;
      try {
        const body = await response.json() as { error?: string; detail?: string };
        detail = body.detail || body.error || detail;
      } catch { /* response may not be JSON */ }
      const code: MusicErrorCode = response.status === 401 || response.status === 403 ? 'AUTHENTICATION_FAILED'
        : response.status === 404 ? 'TRACK_NOT_FOUND'
          : response.status === 429 ? 'RATE_LIMITED' : 'SPOTIFLAC_ERROR';
      throw new MusicServiceError(code, detail, response.status);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof MusicServiceError) throw error;
    if (controller.signal.aborted && !external?.aborted) throw new MusicServiceError('TIMEOUT', 'SpotiFLAC request timed out.');
    throw new MusicServiceError('SPOTIFLAC_UNAVAILABLE', error instanceof Error ? error.message : 'SpotiFLAC is unavailable.');
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abortFromExternal);
  }
}

export const MusicService = {
  async health(): Promise<{ available: boolean; info?: SpotiFLACInfo; error?: string }> {
    try { return { available: true, info: await request<SpotiFLACInfo>('info') }; }
    catch (error) { return { available: false, error: error instanceof Error ? error.message : 'SpotiFLAC unavailable' }; }
  },

  async search(query: string): Promise<MusicTrack[]> {
    const data = await request<{ tracks?: SpotiFLACTrack[]; results?: SpotiFLACTrack[] }>(`search?q=${encodeURIComponent(query)}`);
    return (data.tracks || data.results || []).map(mapTrack);
  },

  async resolve(url: string, signal?: AbortSignal): Promise<MusicTrack[]> {
    const data = await request<{ tracks?: SpotiFLACTrack[] }>('resolve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal,
    });
    return (data.tracks || []).map(mapTrack);
  },

  async requestDownload(url: string, signal?: AbortSignal): Promise<SpotiFLACJob> {
    return request<SpotiFLACJob>('downloads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: spotifyTrackUrl(url), quality: 'LOSSLESS' }), signal,
    });
  },

  async queueDownload(url: string, title: string, signal?: AbortSignal): Promise<SpotiFLACJob> {
    const outputPath = trackOutputPath(title);
    return request<SpotiFLACJob>('downloads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: spotifyTrackUrl(url), quality: 'LOSSLESS', ...(outputPath ? { output_path: outputPath } : {}) }), signal,
    });
  },

  getTrackStatus(jobId: string, signal?: AbortSignal): Promise<SpotiFLACJob> {
    return request<SpotiFLACJob>(`downloads/${encodeURIComponent(jobId)}`, { signal });
  },

  async waitForDownload(jobId: string): Promise<SpotiFLACJob> {
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      const job = await this.getTrackStatus(jobId);
      const state = job.status.toLowerCase();
      if (['completed', 'complete', 'done', 'ready', 'failed'].includes(state)) return job;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new MusicServiceError('TIMEOUT', 'SpotiFLAC download status timed out.');
  },

  async resolveLocalAudio(track: { spotifyId: string; title: string }): Promise<string | null> {
    if (!/^[A-Za-z0-9]{22}$/.test(track.spotifyId) || !track.title) return null;
    try {
      const exactPath = trackOutputPath(track.title);
      return isUsableAudio(exactPath) ? exactPath : null;
    } catch { return null; }
  },

  async listAudioFiles(): Promise<string[]> {
    try { return fs.readdirSync(getSpotiFLACOutputDir()).filter((name) => /\.(flac|m4a|mp3|wav|ogg)$/i.test(name)); }
    catch { return []; }
  },
};

function isUsableAudio(filename: string): boolean {
  try { const stat = fs.statSync(filename); return stat.isFile() && stat.size > 8192; } catch { return false; }
}
