import { clean } from './normalization';

export type TrackVersion = 'studio' | 'live' | 'remix' | 'slowed' | 'sped_up' | 'reverb' | 'extended' | 'radio_edit' | 'acoustic' | 'instrumental' | 'karaoke' | 'loop' | 'mashup' | 'other';

const INDICATORS: Array<[TrackVersion, RegExp]> = [
  ['live', /\b(live|concert|performance|演奏|现场)\b/i],
  ['remix', /\b(remix|rework|mix|edit)\b/i],
  ['slowed', /\b(slowed|slower|低速)\b/i],
  ['sped_up', /\b(sped|speed up|sped-up|nightcore|高速)\b/i],
  ['reverb', /\b(reverb|echo|reverbed)\b/i],
  ['extended', /\b(extended|long version|club version)\b/i],
  ['radio_edit', /\b(radio edit|radio version)\b/i],
  ['acoustic', /\b(acoustic|unplugged)\b/i],
  ['instrumental', /\b(instrumental|karaoke instrumental)\b/i],
  ['karaoke', /\b(karaoke|伴奏)\b/i],
  ['loop', /\b(loop|nonstop|1 hour|one hour|hour loop|mashup|连续播放)\b/i],
];

export function classifyVersion(value: string): TrackVersion {
  const text = clean(value);
  return INDICATORS.find(([, pattern]) => pattern.test(text))?.[0] || 'studio';
}

export function versionsCompatible(source: TrackVersion, candidate: TrackVersion): boolean {
  if (source === candidate) return source !== 'loop';
  if (source === 'studio' && candidate === 'radio_edit') return true;
  if (source === 'radio_edit' && candidate === 'studio') return true;
  return false;
}

export function isDurationVariant(version: TrackVersion): boolean {
  return ['remix', 'slowed', 'sped_up', 'reverb', 'extended', 'live', 'acoustic'].includes(version);
}

export function isForbiddenForNormal(version: TrackVersion): boolean {
  return version !== 'studio' && version !== 'radio_edit';
}
