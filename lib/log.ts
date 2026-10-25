export function log(prefix: string, ...messages: (string | number | Error | object)[]): void {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const msg = messages.map((m) => (m instanceof Error ? m.message : typeof m === 'object' ? JSON.stringify(m) : String(m))).join(' ');
  console.log(`[${timeStr}] ${prefix} ${msg}`);
}
export function logWarn(prefix: string, ...messages: (string | number | Error | object)[]): void {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const msg = messages.map((m) => (m instanceof Error ? m.message : typeof m === 'object' ? JSON.stringify(m) : String(m))).join(' ');
  console.warn(`[${timeStr}] ${prefix} ${msg}`);
}
export function logError(prefix: string, ...messages: (string | number | Error | object)[]): void {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const msg = messages.map((m) => (m instanceof Error ? m.message : typeof m === 'object' ? JSON.stringify(m) : String(m))).join(' ');
  console.error(`[${timeStr}] ${prefix} ${msg}`);
}
