import fs from 'fs';
import path from 'path';

export function getDataDir(): string {
  const env = process.env.DATA_DIR;
  if (env && env.trim()) return path.resolve(env.trim());

  // Electron supplies DATA_DIR in production. This fallback keeps the same
  // per-user location for Next/Electron development instead of writing state
  // into the installed application's directory.
  const appData = process.env.APPDATA || process.env.XDG_CONFIG_HOME;
  return appData ? path.join(appData, 'music', 'data') : path.join(process.cwd(), 'data');
}
