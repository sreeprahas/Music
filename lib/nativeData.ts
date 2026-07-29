import fs from 'fs';
import path from 'path';

const MARKER_FILE = '.neutralino_data_dir';

function markerPath() {
  return path.join(process.cwd(), MARKER_FILE);
}

export function getDataDir(): string {
  const env = process.env.NATIVE_DATA_DIR;
  if (env && env.trim()) return path.resolve(env.trim());

  const marker = markerPath();
  if (fs.existsSync(marker)) {
    try {
      const p = fs.readFileSync(marker, 'utf-8').trim();
      if (p) return path.resolve(p);
    } catch {
      // fallthrough
    }
  }

  return path.join(process.cwd(), 'data');
}

export function setDataDir(dir: string): void {
  const resolved = path.resolve(dir);
  try {
    fs.writeFileSync(markerPath(), resolved, 'utf-8');
    process.env.NATIVE_DATA_DIR = resolved;
  } catch (e) {
    // best-effort
  }
}

export function clearDataDirMarker(): void {
  const marker = markerPath();
  if (fs.existsSync(marker)) {
    try { fs.unlinkSync(marker); } catch {}
  }
}

export default { getDataDir, setDataDir, clearDataDirMarker };
