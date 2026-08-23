/**
 * Local profile storage. Google profiles can reuse this repository later by
 * passing their provider and stable account id instead of synthesizing an email.
 */

import { getDb } from './db';

export type ProfileProvider = 'local' | 'google';

export interface StoredProfile {
  name: string;
  email: string;
  accountType: 'guest' | 'google';
  picture?: string;
}

interface UserProfileRow {
  name: string;
  email: string;
  picture_url: string;
}

const LOCAL_PROFILE = { provider: 'local', accountId: 'local' } as const;

function toStoredProfile(row?: UserProfileRow): StoredProfile {
  if (!row?.name) {
    return { name: '', email: '', accountType: 'guest' };
  }

  return {
    name: row.name,
    email: row.email,
    accountType: row.email ? 'google' : 'guest',
    picture: row.picture_url || undefined,
  };
}

export function getLocalProfile(): StoredProfile {
  const db = getDb();
  const row = db.prepare(`
    SELECT name, email, picture_url
    FROM user_profiles
    WHERE provider = ? AND account_id = ?
  `).get(LOCAL_PROFILE.provider, LOCAL_PROFILE.accountId) as UserProfileRow | undefined;

  return toStoredProfile(row);
}

export function saveLocalProfile(input: {
  name: string;
  email?: string;
  pictureUrl?: string;
}): StoredProfile {
  const name = input.name.trim().slice(0, 60);
  if (!name) {
    throw new Error('Name is required');
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_profiles (
      provider, account_id, name, email, picture_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      picture_url = excluded.picture_url,
      updated_at = excluded.updated_at
  `).run(
    LOCAL_PROFILE.provider,
    LOCAL_PROFILE.accountId,
    name,
    input.email?.trim() ?? '',
    input.pictureUrl?.trim() ?? '',
    now,
    now,
  );

  return getLocalProfile();
}
