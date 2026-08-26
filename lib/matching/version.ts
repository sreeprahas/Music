/**
 * lib/matching/version.ts
 *
 * Granular version classification and compatibility detection.
 */

import { cleanString } from './normalization';

export type TrackVersion =
  | 'studio'
  | 'live'
  | 'acoustic'
  | 'remix'
  | 'remastered'
  | 'instrumental'
  | 'karaoke'
  | 'sped_up'
  | 'slowed'
  | 'nightcore'
  | 'extended'
  | 'radio_edit'
  | 'clean'
  | 'explicit'
  | 'mono'
  | 'demo'
  | 'cover'
  | 'mashup'
  | 'bootleg'
  | 'other';

const VERSION_PATTERNS: Array<{ version: TrackVersion; pattern: RegExp }> = [
  { version: 'karaoke', pattern: /\b(karaoke|instrumental\s+karaoke|backing\s+track|伴奏)\b/i },
  { version: 'instrumental', pattern: /\b(instrumental|karaoke\s+version|no\s+vocals?)\b/i },
  { version: 'cover', pattern: /\b(cover|tribute|performed\s+by|originally\s+by)\b/i },
  { version: 'mashup', pattern: /\b(mashup|mash\s+up|blend|vs\.?)\b/i },
  { version: 'bootleg', pattern: /\b(bootleg|unofficial\s+remix|fan\s+made)\b/i },
  { version: 'live', pattern: /\b(live|in\s+concert|live\s+at|live\s+session|live\s+performance|tour\s+version|acoustic\s+live|unplugged\s+live|现场|演唱会)\b/i },
  { version: 'acoustic', pattern: /\b(acoustic|unplugged|piano\s+version|strings\s+version|stripped)\b/i },
  { version: 'nightcore', pattern: /\b(nightcore)\b/i },
  { version: 'sped_up', pattern: /\b(sped\s+up|speed\s+up|speedup|fast\s+version|高速)\b/i },
  { version: 'slowed', pattern: /\b(slowed|slowed\s+reverb|slowed\s+\+\s+reverb|slower|chopped\s+and\s+screwed|低速)\b/i },
  { version: 'remix', pattern: /\b(remix|re-mix|club\s+mix|extended\s+mix|dub\s+mix|vip\s+mix|rework|flip)\b/i },
  { version: 'extended', pattern: /\b(extended|extended\s+version|long\s+version|12"\s+version|club\s+version)\b/i },
  { version: 'radio_edit', pattern: /\b(radio\s+edit|radio\s+version|single\s+version|clean\s+version|short\s+version)\b/i },
  { version: 'clean', pattern: /\b(clean\s+edit|clean|censored)\b/i },
  { version: 'explicit', pattern: /\b(explicit|dirty\s+version|uncensored)\b/i },
  { version: 'remastered', pattern: /\b(remastered|remaster|digitally\s+remastered|\d{4}\s+remaster)\b/i },
  { version: 'mono', pattern: /\b(mono\s+version|mono\s+mix|mono)\b/i },
  { version: 'demo', pattern: /\b(demo\s+version|demo|early\s+version|work\s+in\s+progress)\b/i },
];

export function detectVersion(text: string): TrackVersion {
  const cleaned = cleanString(text);
  for (const { version, pattern } of VERSION_PATTERNS) {
    if (pattern.test(cleaned)) {
      return version;
    }
  }
  return 'studio';
}

export function detectAllVersions(text: string): TrackVersion[] {
  const cleaned = cleanString(text);
  const detected: TrackVersion[] = [];
  for (const { version, pattern } of VERSION_PATTERNS) {
    if (pattern.test(cleaned) && !detected.includes(version)) {
      detected.push(version);
    }
  }
  return detected.length > 0 ? detected : ['studio'];
}
