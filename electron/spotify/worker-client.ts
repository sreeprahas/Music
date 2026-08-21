type WorkerResponse = { type?: string; requestId?: string; success?: boolean; result?: unknown; error?: { code?: string; message?: string } };

const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage: (message: unknown) => void; on: (event: string, listener: (message: WorkerResponse) => void) => void } }).parentPort;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

if (parentPort) {
  parentPort.on('message', (message) => {
    if (message?.type !== 'spotify-worker-response' || !message.requestId) return;
    const item = pending.get(message.requestId);
    if (!item) return;
    pending.delete(message.requestId);
    if (message.success) item.resolve(message.result);
    else { const error = new Error(message.error?.message || 'Spotify worker request failed.'); error.name = message.error?.code || 'SPOTIFY_ERROR'; item.reject(error); }
  });
}

export function requestSpotifyWorker<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!parentPort) return Promise.reject(new Error('Spotify worker bridge is unavailable outside Electron.'));
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
    try { parentPort.postMessage({ type: 'spotify-worker-request', requestId, method, params }); }
    catch (error) { pending.delete(requestId); reject(error instanceof Error ? error : new Error('Unable to reach Spotify worker.')); }
  });
}

export function getSpotifyWorkerStatus(): Promise<{ status: string }> {
  return requestSpotifyWorker<{ status: string }>('__status');
}
