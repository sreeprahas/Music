const { app, BrowserWindow, Menu, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
const musicIconDataUri = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'public', 'music-icon.png')).toString('base64')}`;

const OAUTH_CONFIG = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  scope: 'openid profile email https://www.googleapis.com/auth/youtube',
};
const SESSION_COOKIE = 'ytm_session';
const AUTH_REQUEST_TTL_MS = 5 * 60 * 1000;
let mainWindow = null;
let nextProcess = null;
let oauthServer = null;
let oauthCancelled = false;
const pendingAuthRequests = new Map();

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
  await mainWindow.webContents.session.cookies.set({ url: 'http://localhost:3000', name: SESSION_COOKIE, value: Buffer.from(JSON.stringify(makeSession(tokens, profile))).toString('base64'), httpOnly: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 });
}
const clearSessionCookie = () => mainWindow ? mainWindow.webContents.session.cookies.remove('http://localhost:3000', SESSION_COOKIE) : Promise.resolve();
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
  mainWindow = new BrowserWindow({ width: 1200, height: 800, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') } });
  Menu.setApplicationMenu(null);
  if (isDev) mainWindow.loadURL('http://localhost:3000'); else { nextProcess = spawn('npm', ['run', 'start'], { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' }); setTimeout(() => mainWindow && mainWindow.loadURL('http://localhost:3000'), 3000); }
  mainWindow.on('closed', () => { mainWindow = null; });
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
    <p>You’re signed in successfully.<br />You can close this window and return to Music.</p>
    <div class="brand">Your library · Downloaded · Yours</div>
  </main>
</body>
</html>`);
      if (callbackState !== state) { notify('auth:login-error', { message: 'Invalid OAuth state received.' }); return; }
      if (oauthCancelled) return;
      if (error || !code) { notify('auth:login-error', { message: requestUrl.searchParams.get('error_description') || error || 'Authentication failed.' }); return; }
      try {
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
        server.close(); oauthServer = null;
      }
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { oauthServer = server; resolve(server.address().port); });
  });
}
ipcMain.handle('auth:login', async () => {
  if (!OAUTH_CONFIG.clientId) return { success: false, error: 'GOOGLE_CLIENT_ID is not configured.' };
  for (const [state, pending] of pendingAuthRequests) if (Date.now() - pending.createdAt > AUTH_REQUEST_TTL_MS) pendingAuthRequests.delete(state);
  oauthCancelled = false;
  const { codeVerifier, codeChallenge } = generatePkcePair(), state = base64Url(crypto.randomBytes(16));
  const port = await startLoopbackServer(state, codeVerifier);
  const redirectUri = `http://127.0.0.1:${port}/oauth2redirect`;
  const authUrl = new URL(OAUTH_CONFIG.authorizationEndpoint); authUrl.search = new URLSearchParams({ response_type: 'code', client_id: OAUTH_CONFIG.clientId, redirect_uri: redirectUri, scope: OAUTH_CONFIG.scope, state, code_challenge: codeChallenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' }).toString();
  await shell.openExternal(authUrl.toString()); return { success: true, started: true };
});
ipcMain.handle('auth:cancel-login', async () => {
  oauthCancelled = true;
  pendingAuthRequests.clear();
  await closeOAuthServer();
  oauthServer = null;
  return { cancelled: true };
});
ipcMain.handle('auth:get-session', async () => {
  const stored = readTokensFromDisk(); if (!stored) return { isAuthenticated: false };
  try { let { tokens, profile } = stored; if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000) { if (!tokens.refreshToken) throw new Error('Your session expired.'); tokens = await refreshAccessToken(tokens.refreshToken); writeTokensToDisk({ tokens, profile }); } await syncSessionCookie(tokens, profile); return { isAuthenticated: true }; }
  catch (error) { clearTokensFromDisk(); await clearSessionCookie(); return { isAuthenticated: false, error: error.message || 'Your session expired. Please sign in again.' }; }
});
ipcMain.handle('auth:logout', async () => { clearTokensFromDisk(); pendingAuthRequests.clear(); await clearSessionCookie(); return { success: true }; });
if (!app.requestSingleInstanceLock()) app.quit(); else {
  app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!mainWindow) createWindow(); }); });
  app.on('window-all-closed', () => { closeOAuthServer(); if (nextProcess) nextProcess.kill(); if (process.platform !== 'darwin') app.quit(); });
}
