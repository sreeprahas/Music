import fs from 'fs';
import path from 'path';

export function getDataDir(): string {
  const env = process.env.DATA_DIR;
  if (env && env.trim()) return path.resolve(env.trim());

  return path.join(process.cwd(), 'data');
}
