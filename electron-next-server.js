const http = require('http');
const next = require('next');

// Electron supplies a stable loopback port so renderer localStorage keeps the
// same origin across app launches.
const port = Number(process.env.PORT || 0);
const nextApp = next({
  dev: process.env.MUSIC_NEXT_DEV === '1',
  dir: __dirname,
  // Turbopack starts a separate Windows helper/console during dev. Webpack
  // keeps Electron development inside the invoking terminal and avoids a
  // random terminal window appearing beside the app.
  webpack: process.env.MUSIC_NEXT_DEV === '1',
});
const handle = nextApp.getRequestHandler();

let spotifyRequestId = 0;
const spotifyRequests = new Map();

function installSpotifyProviderBridge(parentPort) {
  parentPort.on('message', (event) => {
    const message = event && typeof event === 'object' && 'data' in event ? event.data : event;
    if (!message || typeof message !== 'object' || message.type !== 'spotify-event') return;
    const reqTag = `[SpotifyImport:req${message.requestId}]`;
    const pending = spotifyRequests.get(message.requestId);
    if (!pending) return;

    if (message.kind === 'progress') {
      pending.onProgress({
        type: message.progressType,
        fetched: message.fetched || 0,
        total: message.total || 0,
      });
      return;
    }
    spotifyRequests.delete(message.requestId);
    if (message.kind === 'result') {
      console.log(`${reqTag} utility process received response, provider resolving promise`);
      try {
        const result = typeof message.result === 'string'
          ? JSON.parse(message.result)
          : message.result;
        pending.resolve(result);
      } catch (error) {
        console.error(`${reqTag} invalid provider result:`, error.message);
        pending.reject(new Error('Hidden Spotify renderer returned an invalid result.'));
      }
    } else {
      console.error(`${reqTag} utility process received error:`, message.message);
      pending.reject(new Error(message.message || 'Hidden Spotify renderer failed.'));
    }
  });

  globalThis.__musicSpotifyWebContentsProvider = {
    request(input, onProgress) {
      const requestId = ++spotifyRequestId;
      const reqTag = `[SpotifyImport:req${requestId}]`;
      console.log(`${reqTag} IPC request sent to electron-main`);
      const promise = new Promise((resolve, reject) => {
        spotifyRequests.set(requestId, { resolve, reject, onProgress });
        parentPort.postMessage({ type: 'spotify-request', requestId, input });
      });
      return {
        promise,
        cancel() {
          console.log(`${reqTag} IPC cancel sent`);
          parentPort.postMessage({ type: 'spotify-cancel', requestId });
        },
      };
    },
    cancel(requestId) {
      parentPort.postMessage({ type: 'spotify-cancel', requestId });
    },
  };
}

nextApp.prepare().then(() => {
  const token = process.env.MUSIC_ELECTRON_TOKEN;
  const guardedServer = http.createServer((request, response) => {
    if (token && request.headers['x-music-electron-token'] !== token) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('This Music server is available only inside the desktop app.');
      return;
    }
    handle(request, response);
  });
  guardedServer.listen(port, '127.0.0.1', () => {
    process.parentPort?.postMessage({ type: 'ready', port: guardedServer.address().port });
  });
  if (process.parentPort) {
    installSpotifyProviderBridge(process.parentPort);
    process.parentPort.on('message', (event) => {
      const message = event && typeof event === 'object' && 'data' in event ? event.data : event;
      if (message === 'shutdown') {
        for (const pending of spotifyRequests.values()) {
          pending.reject(new Error('Music is shutting down.'));
        }
        spotifyRequests.clear();
        guardedServer.close(() => process.exit(0));
      }
    });
  }
}).catch((error) => {
  process.parentPort?.postMessage({ type: 'error', message: error.message });
  process.exitCode = 1;
});
