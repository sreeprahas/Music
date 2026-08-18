/**
 * spotdl bridge configuration — Python interpreter + worker lifecycle settings.
 *
 * Discovery mirrors the existing yt-dlp pattern (see lib/ytdlp/resolver.ts):
 *   1. Explicit env var (SPOTDL_PYTHON / PYTHON_PATH)
 *   2. Bundled Python in `bin/` (future packaging)
 *   3. `python` / `py` on PATH
 *
 * The bridge spawns `lib/spotdl/worker.py` as a long-lived JSON-RPC subprocess.
 * This module centralizes all paths/timouts so nothing else in the app needs
 * to know about Python, spotdl, or subprocess plumbing.
 */

import fs from 'fs';
import path from 'path';

/**
 * Resolve the absolute path to the bundled worker script.
 *
 * `__dirname` is unreliable in the compiled Next.js server (it points into
 * `.next/server/app/api/...`), so we probe several candidate roots in order:
 *   1. `SPOTDL_WORKER` env (explicit override, must exist)
 *   2. `process.cwd()/lib/spotdl/worker.py` (dev + Next dev server)
 *   3. `__dirname/lib/spotdl/worker.py` (tsx / direct execution)
 *   4. Walk up from `__dirname` looking for `lib/spotdl/worker.py`
 *      (handles the compiled `.next/server/...` case)
 *   5. `process.resourcesPath/app/lib/spotdl/worker.py` (packaged Electron)
 *
 * Throws if the worker cannot be located — the bridge surfaces this as a
 * clear error rather than a confusing Python "file not found".
 */
function resolveWorkerScript(): string {
  const env = process.env.SPOTDL_WORKER;
  if (env && fs.existsSync(env)) return env;

  const rel = path.join('lib', 'spotdl', 'worker.py');

  // 2. project root via cwd (dev + `next dev`)
  const fromCwd = path.join(process.cwd(), rel);
  if (fs.existsSync(fromCwd)) return fromCwd;

  // 3. __dirname (tsx / direct node execution of lib/spotdl/*)
  const fromDirname = path.join(__dirname, rel);
  if (fs.existsSync(fromDirname)) return fromDirname;

  // 4. Walk up from __dirname to find a `lib/spotdl/worker.py`.
  //    In the compiled Next server, __dirname is something like
  //    `.next/server/app/api/search` — walking up reaches the project root.
  let dir = __dirname;
  for (let i = 0; i < 12 && dir && dir !== path.dirname(dir); i++) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }

  // 5. Packaged Electron: resources/app/lib/spotdl/worker.py
  //    `process.resourcesPath` is an Electron-only property (not in Node's
  //    type defs), so access it defensively.
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) {
    const fromResources = path.join(resources, 'app', rel);
    if (fs.existsSync(fromResources)) return fromResources;
  }

  throw new Error(
    `Could not locate spotdl worker script (looked for ${rel} relative to cwd, __dirname, and resourcesPath).`,
  );
}

/** Absolute path to the bundled worker script. */
export const SPOTDL_WORKER_SCRIPT = resolveWorkerScript();

/** Default public spotdl client credentials (shipped with spotdl itself). */
export const SPOTDL_DEFAULT_CLIENT_ID = '5f573c9620494bae87890c0f08a60293';

/**
 * Resolve the Python executable used to launch the spotdl worker.
 *
 * Order:
 *   1. `SPOTDL_PYTHON` env (absolute path, must exist)
 *   2. `PYTHON_PATH` env (absolute path, must exist)
 *   3. Bundled `bin/python.exe` / `bin/python` (future packaging)
 *   4. `python` on PATH (resolved lazily by the OS)
 *
 * Returns `null` when no explicit path is configured and the caller should
 * fall back to spawning `python` directly (the OS will resolve PATH).
 */
export function getPythonPath(): string | null {
  const env = process.env.SPOTDL_PYTHON;
  if (env && fs.existsSync(env)) return env;

  const env2 = process.env.PYTHON_PATH;
  if (env2 && fs.existsSync(env2)) return env2;

  // Future: bundle a Python runtime in bin/ for packaged builds.
  const bundled = path.join(
    process.cwd(),
    'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  );
  if (fs.existsSync(bundled)) return bundled;

  return null;
}

/** Arguments passed to the Python interpreter to launch the worker. */
export function getWorkerArgs(): string[] {
  const py = getPythonPath();
  // `-u` forces unbuffered stdout/stderr so JSON-RPC lines flush immediately.
  return py ? ['-u', SPOTDL_WORKER_SCRIPT] : ['-u', SPOTDL_WORKER_SCRIPT];
}

/** Maximum time (ms) to wait for the worker to print its "ready" line. */
export const SPOTDL_WORKER_STARTUP_TIMEOUT_MS = 60_000;

/**
 * Activity timeout (ms). If the worker produces no stdout for this long during
 * an operation, the operation is considered hung and the worker is restarted.
 * Large playlists can take a while, so this is generous.
 */
export const SPOTDL_WORKER_ACTIVITY_TIMEOUT_MS = 180_000;

/** Maximum number of concurrent in-flight requests on a single worker. */
export const SPOTDL_WORKER_CONCURRENCY = 1;

/** Maximum retries for transient errors (network, rate limit, worker crash). */
export const SPOTDL_MAX_RETRIES = 2;

/** Base delay (ms) for exponential backoff between retries. */
export const SPOTDL_RETRY_BASE_DELAY_MS = 1_000;
