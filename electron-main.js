const { app, BrowserWindow, Menu, utilityProcess } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const musicIconPath = path.join(__dirname, 'public', 'music-icon.png');
const musicUserDataPath = path.join(app.getPath('appData'), 'music');
const ELECTRON_SERVER_PORT = 47821;
const ELECTRON_SERVER_TOKEN = crypto.randomBytes(32).toString('hex');
const isElectronDev = process.argv.includes('--dev');
let mainWindow = null;
let nextProcess = null;
let nextServerPort = null;

app.setName('Music');
app.setAppUserModelId('com.prahas.music');
app.setPath('userData', musicUserDataPath);
fs.mkdirSync(path.join(musicUserDataPath, 'data'), { recursive: true });

const appOrigin = () => isElectronDev ? 'http://127.0.0.1:3000' : `http://127.0.0.1:${nextServerPort}`;

/**
 * Discover a Python interpreter that has spotdl installed.
 * Probes common Windows locations, then PATH. Returns null if none found —
 * the spotdl bridge will surface a clear error to the user in that case.
 */
function findSpotdlPython() {
  const fsSync = require('fs');
  const candidates = [];
  if (process.env.SPOTDL_PYTHON && fsSync.existsSync(process.env.SPOTDL_PYTHON)) {
    return process.env.SPOTDL_PYTHON;
  }
  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    );
  }
  for (const c of candidates) {
    if (c && fsSync.existsSync(c)) return c;
  }
  // Fall back to `python` on PATH; the bridge handles the not-found case.
  return null;
}

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
  mainWindow.on('closed', () => { mainWindow = null; });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const spotdlPython = findSpotdlPython();
    const childEnv = {
      ...process.env,
      PORT: String(ELECTRON_SERVER_PORT),
      MUSIC_ELECTRON_TOKEN: ELECTRON_SERVER_TOKEN,
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      YTDLP_PATH: path.join(__dirname, 'bin', 'yt-dlp.exe'),
    };
    if (spotdlPython) childEnv.SPOTDL_PYTHON = spotdlPython;
    nextProcess = utilityProcess.fork(path.join(__dirname, 'electron-next-server.js'), [], {
      serviceName: 'Music',
      stdio: 'pipe',
      env: childEnv,
    });
    nextProcess.on('message', (message) => {
      if (message?.type === 'ready') { nextServerPort = message.port; resolve(); }
      if (message?.type === 'error') reject(new Error(message.message));
    });
    nextProcess.on('exit', (code) => {
      if (code && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.executeJavaScript(`console.error('Music server exited with code ${code}')`);
    });
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(async () => {
    try { if (!isElectronDev) await startNextServer(); createWindow(); }
    catch (error) { console.error('[server] Failed to start Music server:', error); app.quit(); }
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  });
  app.on('window-all-closed', () => { if (nextProcess) nextProcess.kill(); if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { if (nextProcess) nextProcess.kill(); });
}
