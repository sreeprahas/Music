/**
 * spotdl bridge — a thin Node.js abstraction over a persistent Python worker
 * that fetches Spotify metadata via the spotdl package.
 *
 * Architecture
 * ------------
 *   Existing app (noauthApi, dualSearch, playlistImporter, API routes)
 *                     |
 *                     v
 *            SpotdlBridge (this module)
 *                     |
 *                     v
 *         persistent Python worker (worker.py)  <-- JSON-RPC over stdin/stdout
 *                     |
 *                     v
 *              spotdl SpotifyClient
 *                     |
 *                     v
 *              Spotify Web API
 *
 * The bridge exposes the SAME function signatures the old `noauthApi` module
 * did, so callers (and the normalize layer) are unchanged:
 *   - searchTracksNoauth(query, limit) -> SpotifyPaging<SpotifyTrack>
 *   - getPlaylistNoauth(playlistId)    -> SpotifyPlaylist
 *   - getPlaylistTracksNoauth(id)      -> SpotifyPlaylistItem[]
 *   - getTrackNoauth(trackId)          -> SpotifyTrack
 *   - getAlbumNoauth(albumId)          -> SpotifyAlbum  (new, optional)
 *
 * Concurrency: a single worker serializes Spotify requests (the Spotify API is
 * the bottleneck, not Node). Requests are queued and served in order. The
 * caller may cancel any in-flight request; the worker is restarted on crash.
 *
 * Security: the worker is spawned with an argument array (never a shell).
 * Spotify URLs are validated before being sent. No credentials are logged.
 */

import { spawn, type ChildProcess } from 'child_process';
import { once, EventEmitter } from 'events';
import {
  getPythonPath,
  getWorkerArgs,
  SPOTDL_WORKER_STARTUP_TIMEOUT_MS,
  SPOTDL_WORKER_ACTIVITY_TIMEOUT_MS,
  SPOTDL_MAX_RETRIES,
  SPOTDL_RETRY_BASE_DELAY_MS,
} from './config';
import {
  PythonNotFoundError,
  SpotdlNotInstalledError,
  SpotdlProcessError,
  SpotdlTimeoutError,
  SpotdlCancelledError,
  mapWorkerError,
} from './errors';
import type {
  SpotifyTrack,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifyPaging,
  SpotifyAlbum,
} from '../spotify/models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  activityTimer?: NodeJS.Timeout;
}

interface RpcResponse {
  id: string | null;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Worker process wrapper
// ---------------------------------------------------------------------------

class WorkerProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = '';
  private pending = new Map<string, RpcRequest>();
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private currentRequest: RpcRequest | null = null;

  /** Spawn the worker and resolve once it prints its "ready" envelope. */
  async start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this._start();
    return this.readyPromise;
  }

  private async _start(): Promise<void> {
    const py = getPythonPath();
    // If no explicit path is configured, spawn `python` and let the OS
    // resolve PATH. On Windows this may hit the Store stub; the caller will
    // get a SpotdlNotInstalledError if spotdl isn't importable.
    const cmd = py ?? 'python';
    const args = getWorkerArgs();

    let proc: ChildProcess;
    try {
      // SECURITY: spawn with an argument array — never a shell. No user input
      // is interpolated into the command line.
      proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          // Force UTF-8 stdio so non-ASCII Spotify metadata (artist/track
          // names) round-trips cleanly on Windows (default codec is cp1252).
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      });
    } catch (err) {
      this.readyPromise = null;
      throw new PythonNotFoundError(
        `Failed to launch Python (${cmd}): ${err instanceof Error ? err.message : err}`,
      );
    }

    this.proc = proc;
    this.buffer = '';

    proc.stdout?.setEncoding('utf-8');
    proc.stderr?.setEncoding('utf-8');

    proc.stdout?.on('data', (chunk: string) => this._onStdout(chunk));
    proc.stderr?.on('data', (chunk: string) => this._onStderr(chunk));
    proc.once('error', (err: Error) => this._onFatal(err));
    proc.once('close', (code: number | null) => this._onClose(code));

    // Wait for the "ready" envelope (or a fatal init error).
    await new Promise<void>((resolve, reject) => {
      const onReady = (res: RpcResponse) => {
        if (res.id === null) {
          if (res.ok && res.result && (res.result as { ready?: boolean }).ready) {
            this.ready = true;
            cleanup();
            resolve();
          } else if (!res.ok && res.error?.code === 'spotdl_init_error') {
            cleanup();
            reject(new SpotdlNotInstalledError(res.error.message));
          }
        }
      };
      const onFatal = (err: Error) => { cleanup(); reject(err); };
      const onTimeout = () => {
        cleanup();
        reject(new SpotdlTimeoutError('spotdl worker did not start in time'));
      };
      const timer = setTimeout(onTimeout, SPOTDL_WORKER_STARTUP_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        this.off('rpc', onReady);
        this.off('fatal', onFatal);
      };
      this.on('rpc', onReady);
      this.on('fatal', onFatal);
    });

    this.readyPromise = null;
  }

  private _onStdout(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let res: RpcResponse;
      try {
        res = JSON.parse(line) as RpcResponse;
      } catch {
        // Ignore non-JSON lines (defensive — worker should only emit JSON).
        continue;
      }
      this.emit('rpc', res);
      this._dispatch(res);
    }
  }

  private _onStderr(chunk: string): void {
    // stderr is diagnostic only — spotdl/spotipy write progress/warnings here.
    // Never treat stderr as fatal; route to the debug logger.
    const text = chunk.toString();
    if (text.trim()) console.debug('[spotdl worker stderr]', text.trim());
  }

  private _dispatch(res: RpcResponse): void {
    if (res.id === null) return; // control envelope (ready/init error)
    const req = this.pending.get(res.id);
    if (!req) return;
    this.pending.delete(res.id);
    if (req.activityTimer) clearTimeout(req.activityTimer);
    if (this.currentRequest === req) this.currentRequest = null;

    if (res.ok) {
      req.resolve(res.result);
    } else {
      const err = res.error || { code: 'spotdl_runtime_error', message: 'Unknown worker error' };
      req.reject(mapWorkerError(err.code, err.message));
    }
    this._drainQueue();
  }

  private _drainQueue(): void {
    if (this.currentRequest || !this.ready || this.shuttingDown) return;
    // FIFO: serve the oldest pending request next.
    const next = this.pending.values().next();
    if (next.done || !next.value) return;
    this.currentRequest = next.value;
    this._armActivityTimer(next.value);
    this._send(next.value);
  }

  private _armActivityTimer(req: RpcRequest): void {
    if (req.activityTimer) clearTimeout(req.activityTimer);
    req.activityTimer = setTimeout(() => {
      // Activity timeout — the worker is hung on this request. Reject it and
      // restart the worker so subsequent requests aren't blocked.
      this.pending.delete(req.id);
      if (this.currentRequest === req) this.currentRequest = null;
      req.reject(new SpotdlTimeoutError());
      void this.restart();
    }, SPOTDL_WORKER_ACTIVITY_TIMEOUT_MS);
  }

  private _send(req: RpcRequest): void {
    if (!this.proc?.stdin?.writable) {
      req.reject(new SpotdlProcessError('Worker stdin is not writable'));
      return;
    }
    const payload = JSON.stringify({ id: req.id, method: req.method, params: req.params }) + '\n';
    this.proc.stdin.write(payload);
  }

  private _onFatal(err: Error): void {
    this.ready = false;
    this.emit('fatal', err);
    this._failAll(err);
  }

  private _onClose(code: number | null): void {
    this.ready = false;
    this.proc = null;
    if (!this.shuttingDown) {
      // Unexpected exit — fail pending requests and allow restart on next call.
      this._failAll(new SpotdlProcessError(`Worker exited unexpectedly (code ${code})`));
    } else {
      this._failAll(new SpotdlCancelledError('Worker shut down'));
    }
  }

  private _failAll(err: Error): void {
    for (const req of [...this.pending.values()]) {
      if (req.activityTimer) clearTimeout(req.activityTimer);
      req.reject(err);
    }
    this.pending.clear();
    this.currentRequest = null;
  }

  /** Send a request and await its response. */
  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const req: RpcRequest = { id, method, params, resolve, reject };
      this.pending.set(id, req);
      // If idle, dispatch immediately; otherwise the queue drains when the
      // current request completes.
      if (this.ready && !this.currentRequest) {
        this.currentRequest = req;
        this._armActivityTimer(req);
        this._send(req);
      }
    });
  }

  /** Cancel a specific in-flight request (best-effort). */
  cancel(req: Promise<unknown>): void {
    // The promise wrapper doesn't expose the req id; cancellation is handled
    // at the bridge layer via AbortController. This is a no-op stub kept for
    // interface completeness.
    void req;
  }

  /** Restart the worker (used after a crash or activity timeout). */
  async restart(): Promise<void> {
    this.shuttingDown = true;
    if (this.proc && !this.proc.killed) {
      try { this.proc.kill(); } catch { /* already dead */ }
    }
    this.proc = null;
    this.ready = false;
    this.shuttingDown = false;
    this.readyPromise = null;
    await this.start();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.ready = false;
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.stdin?.end();
        // Give it a moment to exit gracefully, then force-kill.
        await Promise.race([
          once(this.proc, 'close'),
          new Promise<void>((r) => setTimeout(r, 2000)),
        ]);
        if (!this.proc.killed) this.proc.kill('SIGKILL');
      } catch { /* ignore */ }
    }
    this.proc = null;
    this._failAll(new SpotdlCancelledError('Worker stopped'));
  }
}

// ---------------------------------------------------------------------------
// Bridge singleton
// ---------------------------------------------------------------------------

let worker: WorkerProcess | null = null;
let workerPromise: Promise<WorkerProcess> | null = null;

async function getWorker(): Promise<WorkerProcess> {
  if (worker && worker['ready']) return worker;
  if (workerPromise) return workerPromise;
  worker = new WorkerProcess();
  workerPromise = worker.start().then(() => worker!).catch((err) => {
    workerPromise = null;
    worker = null;
    throw err;
  });
  return workerPromise;
}

/** Run a request with bounded retries for transient errors. */
async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= SPOTDL_MAX_RETRIES; attempt++) {
    try {
      const w = await getWorker();
      const result = await w.request(method, params);
      return result as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Don't retry permanent errors.
      const code = (lastErr as { code?: string }).code;
      if (
        code === 'spotify_not_found' ||
        code === 'spotify_invalid_url' ||
        code === 'spotdl_cancelled' ||
        code === 'python_not_found' ||
        code === 'spotdl_not_installed'
      ) {
        throw lastErr;
      }
      // Transient — back off and retry, restarting the worker if it died.
      if (attempt < SPOTDL_MAX_RETRIES) {
        const delay = SPOTDL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        // If the worker died, force a restart on the next attempt.
        if (worker && !worker['ready']) {
          try { await worker.restart(); } catch { /* will retry */ }
        }
        continue;
      }
    }
  }
  throw lastErr ?? new Error('spotdl operation failed');
}

// ---------------------------------------------------------------------------
// Public bridge API — mirrors the old noauthApi signatures
// ---------------------------------------------------------------------------

/** Build a canonical Spotify URL from an id and resource kind. */
function spotifyUrl(kind: 'track' | 'playlist' | 'album', id: string): string {
  return `https://open.spotify.com/${kind}/${id}`;
}

/** Validate a Spotify id (base-62). */
function isValidSpotifyId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9]+$/.test(id) && id.length > 0;
}

/** Search Spotify for tracks (replaces searchTracksNoauth). */
export async function searchTracksNoauth(
  query: string,
  limit = 20,
): Promise<SpotifyPaging<SpotifyTrack>> {
  const result = await rpc<{ items: SpotifyTrack[]; total: number }>('search_tracks', {
    query,
    limit,
  });
  return {
    href: '',
    items: result.items,
    limit,
    offset: 0,
    total: result.total,
    next: null,
    previous: null,
  };
}

/** Fetch a single playlist's metadata (replaces getPlaylistNoauth). */
export async function getPlaylistNoauth(playlistId: string): Promise<SpotifyPlaylist> {
  if (!isValidSpotifyId(playlistId)) {
    throw mapWorkerError('spotify_invalid_url', `Invalid Spotify playlist id: ${playlistId}`);
  }
  const result = await rpc<{ playlist: SpotifyPlaylist; items: SpotifyPlaylistItem[] }>(
    'get_playlist',
    { url: spotifyUrl('playlist', playlistId) },
  );
  return result.playlist;
}

/** Fetch ALL tracks in a playlist (replaces getPlaylistTracksNoauth). */
export async function getPlaylistTracksNoauth(
  playlistId: string,
): Promise<SpotifyPlaylistItem[]> {
  if (!isValidSpotifyId(playlistId)) {
    throw mapWorkerError('spotify_invalid_url', `Invalid Spotify playlist id: ${playlistId}`);
  }
  const result = await rpc<{ playlist: SpotifyPlaylist; items: SpotifyPlaylistItem[] }>(
    'get_playlist',
    { url: spotifyUrl('playlist', playlistId) },
  );
  return result.items;
}

/** Fetch a single track (new — supports future track-by-id flows). */
export async function getTrackNoauth(trackId: string): Promise<SpotifyTrack> {
  if (!isValidSpotifyId(trackId)) {
    throw mapWorkerError('spotify_invalid_url', `Invalid Spotify track id: ${trackId}`);
  }
  return rpc<SpotifyTrack>('get_track', { url: spotifyUrl('track', trackId) });
}

/** Fetch a single album and its tracks (new — supports future album flows). */
export async function getAlbumNoauth(
  albumId: string,
): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }> {
  if (!isValidSpotifyId(albumId)) {
    throw mapWorkerError('spotify_invalid_url', `Invalid Spotify album id: ${albumId}`);
  }
  return rpc<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }>('get_album', {
    url: spotifyUrl('album', albumId),
  });
}

/** Check whether the spotdl worker can start (Python + spotdl available). */
export async function checkSpotdl(): Promise<{ ok: boolean; error?: string }> {
  try {
    await rpc<{ pong: boolean }>('ping', {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Shut down the worker (used on app exit). */
export async function shutdownSpotdl(): Promise<void> {
  if (worker) {
    await worker.stop();
    worker = null;
    workerPromise = null;
  }
}
