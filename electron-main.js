const { app, BrowserWindow, Menu, ipcMain, nativeImage, session, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

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
      await startNextServer({ dev: isElectronDev });
      createWindow();
    } catch (error) {
      console.error('[server] Failed to start Music server:', error);
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
    // This is intentional: after the child is stopped, force the Electron
    // process to leave so no hidden renderer or utility process is orphaned.
    app.exit(0);
  });
}
