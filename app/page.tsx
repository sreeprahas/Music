'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Dashboard } from '@/components/Dashboard';
import { NamePromptModal } from '@/components/NamePromptModal';
import type { UserProfile } from '@/types';

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    fetch('/api/user/profile', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load profile');
        return response.json() as Promise<UserProfile>;
      })
      .then((profile) => {
        if (!cancelled) {
          setUser(profile);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileError('We could not load your local profile.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const saveProfile = useCallback(async (name: string, pictureUrl?: string) => {
    const response = await fetch('/api/user/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...(pictureUrl ? { pictureUrl } : {}) }),
    });
    if (!response.ok) throw new Error('Unable to save profile');
    setUser(await response.json());
  }, []);

  if (!user?.name) {
    return isLoading ? (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-text">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-sidebar/80 px-5 py-4 shadow-xl">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          <span className="text-sm font-medium text-text-secondary">Loading Music…</span>
        </div>
      </main>
    ) : profileError ? (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-text">
        <div className="rounded-2xl border border-border bg-sidebar px-6 py-5 text-center shadow-xl">
          <p className="text-sm font-medium text-text-secondary">{profileError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-background">Try again</button>
        </div>
      </main>
    ) : (
      <NamePromptModal onSubmit={saveProfile} />
    );
  }

  return <Dashboard user={user} onUserChange={setUser} />;
}
