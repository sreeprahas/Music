export interface LyricLine {
  time: number;
  text: string;
}

export function parseLRC(lrc: string): LyricLine[] {
  return lrc
    .split('\n')
    .map((line) => {
      const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
      if (!m) return null;
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      const text = m[4].trim();
      return text ? { time: mins * 60 + secs + ms / 1000, text } : null;
    })
    .filter((l): l is LyricLine => l !== null)
    .sort((a, b) => a.time - b.time);
}

export function getActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) idx = i;
    else break;
  }
  return idx;
}
