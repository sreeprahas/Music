const { app, BrowserWindow, Menu, ipcMain, nativeImage, session, utilityProcess, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const sharp = require('sharp');

// Electron loads the same server-side configuration used by Next before it
// starts either backend process. Values already present in the environment win.
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env.local'), quiet: true });
  dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });
} catch (error) {
  console.warn('[config] dotenv could not be loaded:', error.message);
}

const isElectronDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const musicIconPath = fs.existsSync(path.join(__dirname, 'public', 'music-icon.png'))
  ? path.join(__dirname, 'public', 'music-icon.png')
  : path.join(__dirname, 'public', 'icon.png');
const musicUserDataPath = isElectronDev
  ? path.join(app.getPath('temp'), 'music-dev')
  : path.join(app.getPath('appData'), 'music');
const ELECTRON_SERVER_PORT = 47821;
const ELECTRON_SERVER_TOKEN = crypto.randomBytes(32).toString('hex');
let mainWindow = null;
let nextProcess = null;
let nextServerPort = null;
let spotiflacProcess = null;
let ownsSpotiFLACProcess = false;
let spotiflacReady = false;
let iconUpdateSerial = 0;
let quitting = false;
let spotifyScrapeTail = Promise.resolve();
const activeSpotifyScrapes = new Map();

const THEME_HUES = { cyan: 0, purple: 85, green: -40, amber: -140, rose: 160 };

// Some Windows machines ship an incompatible Chromium GPU driver/runtime. In
// that case Chromium terminates before the window can render, which appears as
// a blank app. Software compositing keeps the shell usable and is preferable to
// a fatal GPU process during startup.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');

async function updateWindowIcon(theme) {
  if (!mainWindow || mainWindow.isDestroyed() || !fs.existsSync(musicIconPath)) return;
  const hue = THEME_HUES[theme];
  if (hue === undefined) return;
  const serial = ++iconUpdateSerial;
  try {
    const buffer = await sharp(musicIconPath).modulate({ hue }).png().toBuffer();
    if (serial === iconUpdateSerial && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIcon(nativeImage.createFromBuffer(buffer));
    }
  } catch (error) {
    console.warn('[icon] Theme icon update unavailable:', error.message);
  }
}

app.setName('Music');
app.setAppUserModelId('com.prahas.music');
app.setPath('userData', musicUserDataPath);
fs.mkdirSync(path.join(musicUserDataPath, 'data'), { recursive: true });

// Forward terminal shutdown signals through Electron's normal quit lifecycle
// so the Next utility process and Chromium profile lock are released in dev.
const requestProcessQuit = () => {
  if (!quitting) app.quit();
};
process.on('SIGINT', requestProcessQuit);
process.on('SIGTERM', requestProcessQuit);

const appOrigin = () => `http://127.0.0.1:${nextServerPort}`;

function configureSpotiFLACEnvironment() {
  const serviceUrl = (process.env.SPOTIFLAC_URL || 'http://127.0.0.1:8000').trim().replace(/\/$/, '');
  const parsed = new URL(serviceUrl);
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw new Error('SPOTIFLAC_URL must be a local HTTP origin such as http://127.0.0.1:8000.');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const isLocal = localHosts.has(hostname) || /^127\./.test(hostname);
  const port = Number(parsed.port || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SPOTIFLAC_URL must use a valid TCP port.');
  }

  process.env.SPOTIFLAC_URL = serviceUrl;
  process.env.SPOTIFLAC_TIMEOUT = process.env.SPOTIFLAC_TIMEOUT || '15000';
  process.env.SPOTIFLAC_CACHE_DIR = path.resolve(
    process.env.SPOTIFLAC_CACHE_DIR || path.join(app.getPath('userData'), 'shared-audio'),
  );
  fs.mkdirSync(process.env.SPOTIFLAC_CACHE_DIR, { recursive: true });

  return { serviceUrl, hostname, port, isLocal, token: process.env.SPOTIFLAC_API_KEY || '' };
}

async function isSpotiFLACHealthy(serviceUrl, token) {
  try {
    const healthUrl = new URL(`${serviceUrl}/api/v1/info`);
    if (token) healthUrl.searchParams.set('token', token);
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

function runPythonCommand(python, args, { timeout = 600_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(python, args, { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const details = [stderr?.trim(), stdout?.trim()].filter(Boolean).join('\n');
        const failure = new Error(`${error.message}${details ? `\n${details}` : ''}`);
        failure.code = error.code;
        reject(failure);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function ensureSpotiFLACInstalled(python) {
  const environmentDir = path.join(app.getPath('appData'), 'music', 'spotiflac-python');
  const pythonExecutable = process.platform === 'win32'
    ? path.join(environmentDir, 'Scripts', 'python.exe')
    : path.join(environmentDir, 'bin', 'python');
  if (!fs.existsSync(pythonExecutable)) {
    console.log('[spotiflac] Creating the app Python environment');
    await runPythonCommand(python, ['-m', 'venv', environmentDir]);
  }

  const moduleCheck = "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('SpotiFLAC.__main__') else 1)";
  try {
    await runPythonCommand(pythonExecutable, ['-c', moduleCheck], { timeout: 15_000 });
    return pythonExecutable;
  } catch (error) {
    console.log('[spotiflac] Python module is missing; installing SpotiFLAC with pip');
  }

  await runPythonCommand(pythonExecutable, ['-m', 'pip', 'install', '--upgrade', 'SpotiFLAC']);
  await runPythonCommand(pythonExecutable, ['-c', moduleCheck], { timeout: 15_000 });
  console.log('[spotiflac] Python module installation is ready');
  return pythonExecutable;
}

async function startSpotiFLAC() {
  const config = configureSpotiFLACEnvironment();
  if (await isSpotiFLACHealthy(config.serviceUrl, config.token)) {
    console.log(`[spotiflac] Reusing service at ${config.serviceUrl}`);
    spotiflacReady = true;
    return;
  }
  if (!config.isLocal) {
    throw new Error(`SpotiFLAC is unavailable at ${config.serviceUrl}; automatic startup is allowed only for loopback URLs.`);
  }

  const python = process.env.SPOTIFLAC_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
  const spotiflacPython = await ensureSpotiFLACInstalled(python);
  const serviceHost = config.hostname === 'localhost' ? '127.0.0.1' : config.hostname;
  const serviceArgs = [
    '-m', 'SpotiFLAC', '--web', '--host', serviceHost, '--port', String(config.port),
  ];
  if (config.token) serviceArgs.push('--web-token', config.token);
  console.log(`[spotiflac] Starting Python module at ${config.serviceUrl}`);

  const child = spawn(spotiflacPython, serviceArgs, {
    cwd: __dirname,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  spotiflacProcess = child;
  ownsSpotiFLACProcess = true;

  let launchError = null;
  let childExited = false;
  let recentOutput = '';
  const recordOutput = (prefix, target) => (chunk) => {
    const value = chunk.toString();
    recentOutput = `${recentOutput}${value}`.slice(-6000);
    target.write(`${prefix}${value}`);
  };
  child.stdout?.on('data', recordOutput('[spotiflac] ', process.stdout));
  child.stderr?.on('data', recordOutput('[spotiflac:error] ', process.stderr));
  child.on('error', (error) => { launchError = error; });
  child.on('exit', (code, signal) => {
    childExited = true;
    if (spotiflacProcess === child) spotiflacProcess = null;
    console.error(`[spotiflac] Process exited (code=${code}, signal=${signal || 'none'})`);
    if (spotiflacReady && !quitting) {
      spotiflacReady = false;
      dialog.showErrorBox('SpotiFLAC stopped', 'The required SpotiFLAC service stopped while Music was open. Music will close.');
      app.quit();
    }
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (launchError) throw new Error(`Could not start Python (${python}): ${launchError.message}`);
    if (childExited || child.exitCode !== null) {
      throw new Error(`SpotiFLAC exited before becoming ready (code ${child.exitCode ?? 'unknown'}).${recentOutput ? `\n\n${recentOutput.trim()}` : ''}`);
    }
    if (await isSpotiFLACHealthy(config.serviceUrl, config.token)) {
      spotiflacReady = true;
      console.log('[spotiflac] REST API is ready');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`SpotiFLAC did not become ready at ${config.serviceUrl} within 60 seconds.`);
}

async function stopSpotiFLAC() {
  const child = spotiflacProcess;
  spotiflacReady = false;
  spotiflacProcess = null;
  if (!child || !ownsSpotiFLACProcess) return;
  ownsSpotiFLACProcess = false;

  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, resolve));
  } else {
    try { child.kill('SIGTERM'); } catch {}
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0D0F13',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0D0F13', symbolColor: '#FFFFFF', height: 71 },
    title: 'Music',
    icon: fs.existsSync(musicIconPath) ? musicIconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  // Register Ctrl+F5 as a global accelerator that forces a full reload
  // (bypassing the HTTP cache). Plain F5 is handled by the renderer as a
  // soft refresh of the sidebar / main view / lyrics / queue.
  const reloadMenu = Menu.buildFromTemplate([
    {
      label: 'Reload',
      accelerator: 'CmdOrCtrl+F5',
      visible: false,
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reloadIgnoringCache();
        }
      },
    },
  ]);
  Menu.setApplicationMenu(reloadMenu);
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`http://127.0.0.1:${ELECTRON_SERVER_PORT}/*`] },
    (details, callback) => {
      details.requestHeaders['X-Music-Electron-Token'] = ELECTRON_SERVER_TOKEN;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  mainWindow.once('ready-to-show', () => mainWindow && !mainWindow.isDestroyed() && mainWindow.show());
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[renderer] did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
  });
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const state = await mainWindow.webContents.executeJavaScript(`({ href: location.href, ready: document.readyState, body: document.body?.innerText?.slice(0, 300) || '', html: document.documentElement?.outerHTML?.length || 0 })`);
      console.log('[renderer] did-finish-load', state);
    } catch (error) {
      console.error('[renderer] post-load inspection failed:', error.message);
    }
  });
  mainWindow.webContents.on('console-message', (details) => {
    console.error(`[renderer:console:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] render-process-gone', details);
  });
  mainWindow.on('blur', () => mainWindow?.webContents.setFrameRate(15));
  mainWindow.on('focus', () => mainWindow?.webContents.setFrameRate(30));
  mainWindow.loadURL(appOrigin());
  updateWindowIcon('cyan');
  mainWindow.on('closed', () => {
    mainWindow = null;
    // A hidden Spotify BrowserWindow must never keep the desktop app alive
    // after the user closes the visible window.
    if (!quitting && process.platform !== 'darwin') app.quit();
  });
}

ipcMain.on('music-theme-changed', (_event, theme) => {
  if (typeof theme === 'string') updateWindowIcon(theme);
});

function startNextServer({ dev = false } = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = {
      ...process.env,
      PORT: String(ELECTRON_SERVER_PORT),
      MUSIC_ELECTRON_TOKEN: ELECTRON_SERVER_TOKEN,
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      SPOTIFLAC_URL: process.env.SPOTIFLAC_URL,
      SPOTIFLAC_API_KEY: process.env.SPOTIFLAC_API_KEY || '',
      SPOTIFLAC_TIMEOUT: process.env.SPOTIFLAC_TIMEOUT,
      SPOTIFLAC_CACHE_DIR: process.env.SPOTIFLAC_CACHE_DIR,
      MUSIC_NEXT_DEV: dev ? '1' : '0',
    };
    nextProcess = utilityProcess.fork(path.join(__dirname, 'electron-next-server.js'), [], {
      serviceName: 'Music',
      stdio: 'pipe',
      env: childEnv,
    });
    nextProcess.stdout?.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
    nextProcess.stderr?.on('data', (chunk) => process.stderr.write(`[next:error] ${chunk}`));
    nextProcess.on('message', async (message) => {
      // UtilityProcess.on('message') receives the raw payload directly (not wrapped in event.data)
      if (message?.type === 'ready') {
        nextServerPort = message.port;
        resolve();
      }
      if (message?.type === 'error') reject(new Error(message.message));
      if (message?.type === 'spotify-request') runHiddenSpotifyScrape(message);
      if (message?.type === 'spotify-cancel') activeSpotifyScrapes.get(message.requestId)?.abort();
    });
    nextProcess.on('exit', (code) => {
      if (code && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`console.error('Music server exited with code ${code}')`);
      }
    });
  });
}

function postToNextServer(message) {
  if (nextProcess) nextProcess.postMessage(message);
}

async function stopNextServer() {
  const child = nextProcess;
  nextProcess = null;
  if (!child) return;

  try {
    child.postMessage('shutdown');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {}

  // The utility process must not survive the Electron shell. Calling kill
  // after the graceful window also handles a stuck Next request/server.
  try { child.kill(); } catch {}
}

async function runHiddenSpotifyScrape({ requestId, input }) {
  const queuedRun = spotifyScrapeTail.then(() => runHiddenSpotifyScrapeExclusive({ requestId, input }));
  spotifyScrapeTail = queuedRun.catch(() => {});
  return queuedRun;
}

async function runHiddenSpotifyScrapeExclusive({ requestId, input }) {
  const reqTag = `[SpotifyImport:req${requestId}]`;
  console.log(`${reqTag} electron-main received`);
  const controller = new AbortController();
  let scraper = null;
  activeSpotifyScrapes.set(requestId, controller);
  try {
    const { SpotifyPlaylistScraper } = require('./electron/spotify/SpotifyPlaylistScraper.cjs');
    // A Spotify renderer exists only for the duration of this request.
    scraper = new SpotifyPlaylistScraper();
    console.log(`${reqTag} scraper started`);
    const result = await scraper.scrape(input, {
      signal: controller.signal,
      onProgress: (progress) => postToNextServer({
        type: 'spotify-event',
        kind: 'progress',
        requestId,
        progressType: progress.type,
        fetched: progress.fetched,
        total: progress.total,
      }),
    });
    console.log(`${reqTag} scraper collected ${result.tracks?.length || 0} tracks`);
    console.log(`${reqTag} scraper returning result`);
    const cleanResult = JSON.parse(JSON.stringify(result));
    console.log(`${reqTag} electron-main sending response`);
    // Send the completed scrape as a JSON string across the UtilityProcess
    // boundary.  Large nested structured-clone payloads can be silently lost
    // by Electron's utility-process IPC on Windows; the request must resolve
    // after the scraper has already completed successfully.
    postToNextServer({ type: 'spotify-event', kind: 'result', requestId, result: JSON.stringify(cleanResult) });
  } catch (error) {
    console.error(`${reqTag} electron-main error:`, error.message);
    postToNextServer({
      type: 'spotify-event',
      kind: 'error',
      requestId,
      message: error.message,
      code: error.code,
    });
  } finally {
    // Release Chromium, page state, response captures, and the in-memory
    // Spotify session immediately after import/sync completes.
    if (scraper) scraper.destroy();
    activeSpotifyScrapes.delete(requestId);
  }
}

function cancelHiddenSpotifyScrapes() {
  for (const controller of activeSpotifyScrapes.values()) controller.abort();
  activeSpotifyScrapes.clear();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    try {
      await startSpotiFLAC();
      await startNextServer({ dev: isElectronDev });
      createWindow();
    } catch (error) {
      console.error('[server] Failed to start Music server:', error);
      dialog.showErrorBox('Music could not start', error instanceof Error ? error.message : String(error));
      app.quit();
    }
    app.on('activate', () => {
      if (!mainWindow) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', async (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    cancelHiddenSpotifyScrapes();
    await stopNextServer();
    await stopSpotiFLAC();
    // This is intentional: after the child is stopped, force the Electron
    // process to leave so no hidden renderer or utility process is orphaned.
    app.exit(0);
  });
}
