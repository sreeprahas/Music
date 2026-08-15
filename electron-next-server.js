const http = require('http');
const next = require('next');

const port = Number(process.env.PORT || 3000);
const nextApp = next({ dev: false, dir: __dirname });
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const server = http.createServer((request, response) => handle(request, response));
  server.listen(port, '127.0.0.1', () => {
    process.parentPort?.postMessage({ type: 'ready', port });
  });
  process.parentPort?.on('message', (message) => {
    if (message === 'shutdown') server.close(() => process.exit(0));
  });
}).catch((error) => {
  process.parentPort?.postMessage({ type: 'error', message: error.message });
  process.exitCode = 1;
});
