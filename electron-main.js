const { app, BrowserWindow, Menu, ipcMain, safeStorage, shell, utilityProcess } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
const musicIconDataUri = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'public', 'music-icon.png')).toString('base64')}`;
const musicIconPath = path.join(__dirname, 'public', 'music-icon.png');

app.setName('Music');
app.setAppUserModelId('com.prahas.music');
// Keep Chromium localStorage, auth tokens, downloaded audio, caches, queues,
// and panel/player settings together in the stable per-user app directory.
// This directory survives normal upgrades and is only removed by uninstall.
const musicUserDataPath = path.join(app.getPath('appData'), 'music');
app.setPath('userData', musicUserDataPath);
try {
  const dataPath = path.join(musicUserDataPath, 'data');
  fs.mkdirSync(dataPath, { recursive: true });
  // Older builds placed server data directly in %APPDATA%\\music. Move only
  // known server-data entries into the requested data subdirectory; browser
  // storage and auth_tokens.enc remain at the profile root.
  const dataEntries = ['lyrics', 'mp3', 'playlist-thumbnails', 'thumbnails', 'metadata_cache.json', 'operations.db', 'operations.db-shm', 'operations.db-wal', 'playlist_commands.json'];
  for (const entry of dataEntries) {
    const source = path.join(musicUserDataPath, entry);
    const destination = path.join(dataPath, entry);
    if (!fs.existsSync(source)) continue;
    if (fs.existsSync(destination) && fs.statSync(destination).isDirectory() && fs.statSync(source).isDirectory()) {
      for (const child of fs.readdirSync(source)) {
        const childDestination = path.join(destination, child);
        if (!fs.existsSync(childDestination)) fs.cpSync(path.join(source, child), childDestination, { recursive: true, force: true });
      }
    } else if (!fs.existsSync(destination)) {
      fs.cpSync(source, destination, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.warn('[storage] Could not migrate legacy Music data:', error.message);
}

const OAUTH_CONFIG = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  clientId: process.env.GOOGLE_CLIENT_ID?.trim(),
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
  // The device flow obtains ytmusicapi's YouTube scope itself. These are only
  // the identity scopes used by the legacy browser OAuth path.
  scope: 'openid profile email',
};
const SESSION_COOKIE = 'ytm_session';
// Keep the renderer origin stable across launches. A random port would create
// a new Chromium localStorage origin every time the app starts.
const ELECTRON_SERVER_PORT = 47821;
const ELECTRON_SERVER_TOKEN = crypto.randomBytes(32).toString('hex');
const isElectronDev = process.argv.includes('--dev');
const AUTH_REQUEST_TTL_MS = 5 * 60 * 1000;
let mainWindow = null;
let nextProcess = null;
let nextServerPort = null;
let oauthServer = null;
let oauthCancelled = false;
let deviceAuthTimer = null;
const pendingAuthRequests = new Map();
const appOrigin = () => isElectronDev ? 'http://127.0.0.1:3000' : `http://127.0.0.1:${nextServerPort}`;

const tokenFilePath = () => path.join(app.getPath('userData'), 'auth_tokens.enc');
const base64Url = (value) => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
function generatePkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(32));
  return { codeVerifier, codeChallenge: base64Url(crypto.createHash('sha256').update(codeVerifier).digest()) };
}
function writeTokensToDisk(payload) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable, so Music cannot save your login.');
  fs.writeFileSync(tokenFilePath(), safeStorage.encryptString(JSON.stringify(payload)), { mode: 0o600 });
}
function readTokensFromDisk() {
  if (!fs.existsSync(tokenFilePath()) || !safeStorage.isEncryptionAvailable()) return null;
  try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenFilePath()))); }
  catch (error) { console.warn('[auth] Could not decrypt stored session:', error.message); return null; }
}
function clearTokensFromDisk() { if (fs.existsSync(tokenFilePath())) fs.unlinkSync(tokenFilePath()); }
function sidecarPath() {
  const packaged = path.join(process.resourcesPath || '', 'ytmusic-sidecar.exe');
  if (fs.existsSync(packaged)) return { command: packaged, args: [] };
  return { command: process.env.YTMUSIC_PYTHON || 'python', args: [path.join(__dirname, 'services', 'ytmusic_service.py')] };
}
function runSidecar(request) {
  return new Promise((resolve, reject) => {
    const command = sidecarPath();
    const child = spawn(command.command, command.args, { windowsHide: true, env: { ...process.env, PYTHONPATH: process.env.YTMUSIC_PYTHONPATH }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', () => {
      try { const response = JSON.parse(stdout.trim()); if (!response.ok) reject(new Error(response.error || stderr || 'YouTube Music authentication failed')); else resolve(response.result); }
      catch { reject(new Error(stderr || 'YouTube Music sidecar returned invalid JSON')); }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}
function postForm(endpoint, parameters) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(parameters).toString();
    const url = new URL(endpoint);
    const request = https.request({ hostname: url.hostname, path: `${url.pathname}${url.search}`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), Accept: 'application/json' } }, (response) => {
      let data = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { data += chunk; }); response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let detail = '';
          try { const parsed = JSON.parse(data); detail = parsed.error_description || parsed.error || ''; } catch { /* non-JSON response */ }
          return reject(new Error(`Token exchange failed (${response.statusCode})${detail ? `: ${detail}` : '.'}`));
        }
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Token endpoint returned invalid JSON.')); }
      });
    });
    request.setTimeout(20_000, () => request.destroy(new Error('Token request timed out.'))); request.on('error', reject); request.end(body);
  });
}
function normalizeTokens(response, fallbackRefreshToken = null) {
  if (!response.access_token) throw new Error('Token response is missing an access token.');
  return { accessToken: response.access_token, refreshToken: response.refresh_token || fallbackRefreshToken, expiresAt: response.expires_in ? Date.now() + Number(response.expires_in) * 1000 : null };
}
async function exchangeCodeForTokens(code, verifier, redirectUri) {
  return normalizeTokens(await postForm(OAUTH_CONFIG.tokenEndpoint, { grant_type: 'authorization_code', code, client_id: OAUTH_CONFIG.clientId, client_secret: OAUTH_CONFIG.clientSecret, redirect_uri: redirectUri, code_verifier: verifier }));
}
async function refreshAccessToken(refreshToken) {
  return normalizeTokens(await postForm(OAUTH_CONFIG.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: OAUTH_CONFIG.clientId, client_secret: OAUTH_CONFIG.clientSecret }), refreshToken);
}
async function fetchProfile(accessToken) {
  const response = await new Promise((resolve, reject) => { const request = https.get('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }, resolve); request.setTimeout(20_000, () => request.destroy(new Error('Profile request timed out.'))); request.on('error', reject); });
  let data = ''; for await (const chunk of response) data += chunk;
  if (response.statusCode !== 200) throw new Error('Could not retrieve your Google profile.');
  return JSON.parse(data);
}
function makeSession(tokens, profile) { return { email: profile.email, name: profile.name || profile.email, picture: profile.picture || '', image: profile.picture || '', accessToken: tokens.accessToken, refreshToken: tokens.refreshToken || '', expiresAt: tokens.expiresAt || Date.now() + 3600 * 1000 }; }
async function syncSessionCookie(tokens, profile) {
  if (!mainWindow) return;
  const payload = Buffer.from(JSON.stringify(makeSession(tokens, profile))).toString('base64url');
  const secret = process.env.SESSION_SECRET || OAUTH_CONFIG.clientSecret || 'change-me';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  await mainWindow.webContents.session.cookies.set({ url: appOrigin(), name: SESSION_COOKIE, value: `${payload}.${signature}`, httpOnly: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 });
}
const clearSessionCookie = () => mainWindow && nextServerPort ? mainWindow.webContents.session.cookies.remove(appOrigin(), SESSION_COOKIE) : Promise.resolve();
const notify = (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); };
function closeOAuthServer() {
  return oauthServer ? new Promise((resolve) => oauthServer.close(resolve)) : Promise.resolve();
}
async function handleAuthCallback(callbackUrl) {
  const url = new URL(callbackUrl), error = url.searchParams.get('error'), state = url.searchParams.get('state'), code = url.searchParams.get('code');
  if (error) return notify('auth:login-error', { message: url.searchParams.get('error_description') || error });
  const pending = state && pendingAuthRequests.get(state);
  if (!pending || !code || Date.now() - pending.createdAt > AUTH_REQUEST_TTL_MS) { if (state) pendingAuthRequests.delete(state); return notify('auth:login-error', { message: 'Received an invalid or expired sign-in callback.' }); }
  pendingAuthRequests.delete(state);
  try { const tokens = await exchangeCodeForTokens(code, pending.codeVerifier); const profile = await fetchProfile(tokens.accessToken); writeTokensToDisk({ tokens, profile }); await syncSessionCookie(tokens, profile); notify('auth:login-success', { isAuthenticated: true }); }
  catch (error) { console.error('[auth] Callback failed:', error); notify('auth:login-error', { message: error.message || 'Authentication failed.' }); }
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
  // Authenticate every renderer request to the private loopback server. A
  // normal browser on the machine cannot open the app URL without this token.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`http://127.0.0.1:${ELECTRON_SERVER_PORT}/*`] },
    (details, callback) => {
      details.requestHeaders['X-Music-Electron-Token'] = ELECTRON_SERVER_TOKEN;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  const throttleInactiveRenderer = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setFrameRate(15);
      mainWindow.webContents.executeJavaScript("document.documentElement.classList.add('electron-inactive')").catch(() => {});
    }
  };
  const restoreActiveRenderer = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setFrameRate(30);
      mainWindow.webContents.executeJavaScript("document.documentElement.classList.remove('electron-inactive')").catch(() => {});
    }
  };
  mainWindow.on('blur', throttleInactiveRenderer);
  mainWindow.on('minimize', throttleInactiveRenderer);
  mainWindow.on('focus', restoreActiveRenderer);
  mainWindow.on('restore', restoreActiveRenderer);
  mainWindow.loadURL(appOrigin());
  mainWindow.on('closed', () => { mainWindow = null; });
}
function startNextServer() {
  return new Promise((resolve, reject) => {
    nextProcess = utilityProcess.fork(path.join(__dirname, 'electron-next-server.js'), [], {
      serviceName: 'Music',
      stdio: 'pipe',
      env: { ...process.env, PORT: String(ELECTRON_SERVER_PORT), MUSIC_ELECTRON_TOKEN: ELECTRON_SERVER_TOKEN, DATA_DIR: path.join(app.getPath('userData'), 'data'), YTMUSIC_SIDECAR_PATH: path.join(process.resourcesPath || __dirname, 'ytmusic-sidecar.exe') },
    });
    nextProcess.on('message', (message) => {
      if (message?.type === 'ready') { nextServerPort = message.port; resolve(); }
      if (message?.type === 'error') reject(new Error(message.message));
    });
    nextProcess.on('exit', (code) => {
      if (code && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`console.error('Music server exited with code ${code}')`);
      }
    });
  });
  return nextServerReady;
}
function startLoopbackServer(state, codeVerifier) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      if (requestUrl.pathname !== '/oauth2redirect') { response.writeHead(404); response.end(); return; }
      const callbackState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');
      const error = requestUrl.searchParams.get('error');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Music · Sign-in complete</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; overflow: hidden; color: #fff; background: #08090b; }
    body::before, body::after { content: ""; position: fixed; width: 42vw; height: 42vw; border-radius: 999px; filter: blur(80px); opacity: .2; pointer-events: none; }
    body::before { top: -18vw; right: -8vw; background: #00f2fe; }
    body::after { bottom: -22vw; left: -12vw; background: #ff2d55; opacity: .12; }
    .card { position: relative; width: min(420px, calc(100vw - 40px)); padding: 42px 34px 36px; text-align: center; border: 1px solid rgba(255,255,255,.1); border-radius: 30px; background: rgba(23,24,29,.88); box-shadow: 0 24px 80px rgba(0,0,0,.55), 0 0 40px rgba(0,242,254,.08); backdrop-filter: blur(22px); }
    .logo { width: 70px; height: 70px; margin: 0 auto 22px; display: grid; place-items: center; border-radius: 23px; background: #17181d; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 12px 28px rgba(0,0,0,.24); }
    .logo img { width: 100%; height: 100%; object-fit: cover; border-radius: 23px; }
    .check { position: absolute; top: 29px; right: 28px; width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; color: #061014; background: #00f2fe; font-size: 15px; font-weight: 900; }
    h1 { margin: 0; font-size: 25px; letter-spacing: -.03em; }
    p { margin: 11px 0 0; color: rgba(255,255,255,.52); font-size: 14px; line-height: 1.6; }
    .brand { margin-top: 28px; color: rgba(255,255,255,.28); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
  </style>
</head>
<body>
  <main class="card">
    <div class="check">✓</div>
    <div class="logo"><img src="${musicIconDataUri}" alt="Music" /></div>
    <h1>Music sign-in complete</h1>
    <p>You’re signed in successfully.<br />You can return to Music.</p>
    <div class="brand">Your library · Downloaded · Yours</div>
  </main>
</body>
</html>`);
      try {
        if (callbackState !== state) { notify('auth:login-error', { message: 'Invalid OAuth state received.' }); return; }
        if (server.cancelled || oauthCancelled) return;
        if (error || !code) { notify('auth:login-error', { message: requestUrl.searchParams.get('error_description') || error || 'Authentication failed.' }); return; }
        const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2redirect`;
        const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
        const profile = await fetchProfile(tokens.accessToken);
        writeTokensToDisk({ tokens, profile });
        await syncSessionCookie(tokens, profile);
        notify('auth:login-success', { isAuthenticated: true });
      } catch (callbackError) {
        console.error('[auth] Callback failed:', callbackError);
        notify('auth:login-error', { message: callbackError.message || 'Authentication failed.' });
      } finally {
        // Always release the loopback listener, including cancelled/error callbacks.
        if (!server.listening) { if (oauthServer === server) oauthServer = null; }
        else server.close(() => { if (oauthServer === server) oauthServer = null; });
      }
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { oauthServer = server; resolve(server.address().port); });
  });
}
ipcMain.handle('auth:login', async () => {
  if (!OAUTH_CONFIG.clientId || !OAUTH_CONFIG.clientSecret) return { success: false, error: 'Google OAuth client credentials are not configured.' };
  oauthCancelled = false;
  try {
    const oauth = { client_id: OAUTH_CONFIG.clientId, client_secret: OAUTH_CONFIG.clientSecret };
    const response = await runSidecar({ action: 'oauth_code', oauth });
    const code = response.code || {};
    const deviceCode = {
      userCode: code.user_code,
      verificationUrl: code.verification_url || code.verification_uri,
    };
    if (!deviceCode.userCode || !deviceCode.verificationUrl || !code.device_code) throw new Error('YouTube Music did not return a device verification code.');
    notify('auth:device-code', deviceCode);
    await shell.openExternal(deviceCode.verificationUrl);

    const expiresAt = Date.now() + Number(code.expires_in || 1800) * 1000;
    let intervalMs = Math.max(5000, Number(code.interval || 5) * 1000);
    const poll = async () => {
      if (oauthCancelled || Date.now() >= expiresAt) {
        if (!oauthCancelled) notify('auth:login-error', { message: 'The Google verification code expired. Please try again.' });
        return;
      }
      try {
        const tokenResponse = await runSidecar({ action: 'oauth_token', oauth, device_code: code.device_code });
        if (tokenResponse.token?.access_token) {
          const tokens = normalizeTokens(tokenResponse.token);
          let profile;
          try {
            profile = await fetchProfile(tokens.accessToken);
          } catch {
            // ytmusicapi's TV/Limited Input token is intentionally scoped to
            // YouTube Music and may not authorize Google's OpenID userinfo
            // endpoint. Use ytmusicapi's authenticated account menu instead.
            const accountResponse = await runSidecar({
              action: 'account_info',
              oauth,
              token: tokenResponse.token,
            });
            const account = accountResponse.account || {};
            const accountName = account.accountName || account.channelHandle || 'YouTube Music user';
            profile = {
              name: accountName,
              email: account.channelHandle || accountName,
              picture: account.accountPhotoUrl || '',
            };
          }
          writeTokensToDisk({ tokens, profile, authMode: 'ytmusic-device' });
          await syncSessionCookie(tokens, profile);
          notify('auth:login-success', { isAuthenticated: true });
          return;
        }
        if (tokenResponse.token?.error === 'slow_down') intervalMs += 5000;
        if (tokenResponse.token?.error && !['authorization_pending', 'slow_down'].includes(tokenResponse.token.error)) {
          notify('auth:login-error', { message: tokenResponse.token.error_description || 'Google device authentication failed.' });
          return;
        }
      } catch (error) {
        notify('auth:login-error', { message: error.message || 'YouTube Music authentication failed.' });
        return;
      }
      deviceAuthTimer = setTimeout(poll, intervalMs);
    };
    deviceAuthTimer = setTimeout(poll, intervalMs);
    return { success: true, started: true, deviceCode };
  } catch (error) {
    return { success: false, error: error.message || 'Could not start Google authentication.' };
  }
});
ipcMain.handle('auth:cancel-login', async () => {
  oauthCancelled = true;
  if (deviceAuthTimer) { clearTimeout(deviceAuthTimer); deviceAuthTimer = null; }
  pendingAuthRequests.clear();
  if (oauthServer) oauthServer.cancelled = true;
  await closeOAuthServer();
  oauthServer = null;
  return { cancelled: true };
});
ipcMain.handle('auth:get-session', async () => {
  const stored = readTokensFromDisk(); if (!stored) return { isAuthenticated: false };
  if (stored.authMode !== 'ytmusic-device') {
    clearTokensFromDisk();
    await clearSessionCookie();
    return { isAuthenticated: false, error: 'Your old login must be replaced. Please sign in again.' };
  }
  try { let { tokens, profile } = stored; if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000) { if (!tokens.refreshToken) throw new Error('Your session expired.'); tokens = await refreshAccessToken(tokens.refreshToken); writeTokensToDisk({ tokens, profile, authMode: 'ytmusic-device' }); } await syncSessionCookie(tokens, profile); return { isAuthenticated: true }; }
  catch (error) { clearTokensFromDisk(); await clearSessionCookie(); return { isAuthenticated: false, error: error.message || 'Your session expired. Please sign in again.' }; }
});
ipcMain.handle('auth:logout', async () => {
  try { clearTokensFromDisk(); } catch (error) { console.warn('[auth] Could not remove stored login:', error.message); }
  pendingAuthRequests.clear();
  try { await clearSessionCookie(); } catch (error) { console.warn('[auth] Could not clear session cookie:', error.message); }
  return { success: true };
});
if (!app.requestSingleInstanceLock()) app.quit(); else {
  app.whenReady().then(async () => {
    try { if (!isElectronDev) await startNextServer(); createWindow(); }
    catch (error) { console.error('[server] Failed to start Music server:', error); app.quit(); }
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  });
  app.on('window-all-closed', () => { closeOAuthServer(); if (nextProcess) nextProcess.kill(); if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { closeOAuthServer(); if (nextProcess) nextProcess.kill(); });
}
