const { app, BrowserWindow, Menu, utilityProcess, ipcMain, nativeImage, session } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');
const { SpotApiWorkerManager } = require('./electron/spotify/worker-manager');

const musicIconPath = path.join(__dirname, 'public', 'music-icon.png');
const isElectronDev = process.argv.includes('--dev');
const devPortIndex = process.argv.indexOf('--port');
const electronDevPort = devPortIndex >= 0 && process.argv[devPortIndex + 1] ? Number(process.argv[devPortIndex + 1]) : 3000;
const musicUserDataPath = isElectronDev
  ? path.join(app.getPath('temp'), 'music-dev')
  : path.join(app.getPath('appData'), 'music');
const ELECTRON_SERVER_PORT = 47821;
const ELECTRON_SERVER_TOKEN = crypto.randomBytes(32).toString('hex');
let mainWindow = null;
let nextProcess = null;
let nextServerPort = null;
let iconUpdateSerial = 0;
const spotifyWorkerManager = new SpotApiWorkerManager({
  app,
  env: { SPOTAPI_SESSION_FILE: path.join(musicUserDataPath, 'data', 'spotapi-session.json') },
});
let quitting = false;

const THEME_HUES = { cyan: 0, purple: 85, green: -40, amber: -140, rose: 160 };

// Some Windows environments do not expose a usable GPU to Electron. The
// renderer remains fully functional with software compositing.
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
app.disableHardwareAcceleration();

async function updateWindowIcon(theme) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
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

const appOrigin = () => `http://127.0.0.1:${nextServerPort}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#08090b',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0A0A0A', symbolColor: '#FFFFFF', height: 71 },
    title: 'Music',
    icon: musicIconPath,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: true, preload: path.join(__dirname, 'preload.js') },
  });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`http://127.0.0.1:${ELECTRON_SERVER_PORT}/*`] },
    (details, callback) => {
      details.requestHeaders['X-Music-Electron-Token'] = ELECTRON_SERVER_TOKEN;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  mainWindow.once('ready-to-show', () => mainWindow && !mainWindow.isDestroyed() && mainWindow.show());
  mainWindow.on('blur', () => mainWindow?.webContents.setFrameRate(15));
  mainWindow.on('focus', () => mainWindow?.webContents.setFrameRate(30));
  mainWindow.loadURL(appOrigin());
  updateWindowIcon('cyan');
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.on('music-theme-changed', (_event, theme) => {
  if (typeof theme === 'string') updateWindowIcon(theme);
});

ipcMain.handle('spotify-open-popup', async () => {
  const popup = new BrowserWindow({
    parent: mainWindow || undefined,
    width: 520,
    height: 760,
    title: 'Sign in to Spotify',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Spotify's open.spotify.com/login route now returns a 404. SpotAPI uses
  // the account login endpoint, which also establishes the web cookies we
  // import after the user closes this popup.
  await popup.loadURL('https://accounts.spotify.com/en/login');
  return new Promise((resolve) => {
    let finished = false;
    let checking = false;
    const startedAt = Date.now();
    const finish = (result) => { if (finished) return; finished = true; clearInterval(timer); resolve(result); };
    const readAndValidateSession = async () => {
      if (finished || checking || popup.isDestroyed()) return;
      checking = true;
      try {
        const cookies = [
          ...(await session.defaultSession.cookies.get({ url: 'https://accounts.spotify.com' })),
          ...(await session.defaultSession.cookies.get({ url: 'https://open.spotify.com' })),
          ...(await session.defaultSession.cookies.get({ url: 'https://www.spotify.com' })),
        ];
        const cookieMap = Object.fromEntries(cookies.map((cookie) => [cookie.name, cookie.value]));
        if (Object.keys(cookieMap).length) {
          const result = await spotifyWorkerManager.request('login_session', { identifier: 'electron-browser-session', cookies: cookieMap });
          if (result?.connected) {
            finish(result);
            if (!popup.isDestroyed()) popup.close();
          }
        }
      } catch (error) {
        // Cookies may exist before Spotify finishes its login redirect. Keep
        // polling until validation succeeds or the user closes the popup.
        if (Date.now() - startedAt > 10 * 60 * 1000) {
          console.warn('[spotify-popup] Spotify session was not validated:', error.message);
          finish({ connected: false, error: error.message });
          if (!popup.isDestroyed()) popup.close();
        }
      } finally { checking = false; }
    };
    const timer = setInterval(readAndValidateSession, 1200);
    popup.once('closed', () => finish({ connected: false }));
    setTimeout(readAndValidateSession, 1200);
  });
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
    nextProcess.on('message', async (message) => {
      if (message?.type === 'ready') { nextServerPort = message.port; resolve(); }
      if (message?.type === 'error') reject(new Error(message.message));
      if (message?.type === 'spotify-worker-request') {
        try {
          const result = message.method === '__status'
            ? { status: spotifyWorkerManager.getStatus() }
            : await spotifyWorkerManager.request(message.method, message.params || {});
          nextProcess?.postMessage({ type: 'spotify-worker-response', requestId: message.requestId, success: true, result });
        } catch (error) {
          nextProcess?.postMessage({ type: 'spotify-worker-response', requestId: message.requestId, success: false, error: { code: error.code || 'SPOTIFY_ERROR', message: error.message || 'Spotify worker request failed.' } });
        }
      }
    });
    nextProcess.on('exit', (code) => {
      if (code && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.executeJavaScript(`console.error('Music server exited with code ${code}')`);
    });
  });
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
    try { await spotifyWorkerManager.start(); await startNextServer({ dev: isElectronDev }); createWindow(); }
    catch (error) { console.error('[server] Failed to start Music server:', error); app.quit(); }
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', async (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    try { await spotifyWorkerManager.stop(); } catch (error) { console.warn('[spotify-worker] shutdown failed:', error.message); }
    if (nextProcess) { try { nextProcess.postMessage('shutdown'); } catch { nextProcess.kill(); } nextProcess = null; }
    app.exit(0);
  });
}
