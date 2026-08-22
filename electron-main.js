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

const THEME_HUES = { cyan: 0, purple: 85, green: -40, amber: -140, rose: 160 };

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
app.disableHardwareAcceleration();

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
    icon: fs.existsSync(musicIconPath) ? musicIconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true,
      preload: path.join(__dirname, 'preload.js'),
    },
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
  mainWindow.on('closed', () => {
    mainWindow = null;
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
    nextProcess.on('message', async (message) => {
      if (message?.type === 'ready') {
        nextServerPort = message.port;
        resolve();
      }
      if (message?.type === 'error') reject(new Error(message.message));
    });
    nextProcess.on('exit', (code) => {
      if (code && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`console.error('Music server exited with code ${code}')`);
      }
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
    if (nextProcess) {
      try {
        nextProcess.postMessage('shutdown');
      } catch {
        nextProcess.kill();
      }
      nextProcess = null;
    }
    app.exit(0);
  });
}
