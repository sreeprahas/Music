const http = require('http');
const next = require('next');

// Electron supplies a stable loopback port so renderer localStorage keeps the
// same origin across app launches.
const port = Number(process.env.PORT || 0);
const nextApp = next({ dev: false, dir: __dirname });
const handle = nextApp.getRequestHandler();

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
  process.parentPort?.on('message', (message) => {
    if (message === 'shutdown') guardedServer.close(() => process.exit(0));
  });
}).catch((error) => {
  process.parentPort?.postMessage({ type: 'error', message: error.message });
  process.exitCode = 1;
});
