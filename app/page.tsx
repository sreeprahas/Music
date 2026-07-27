'use client';

import React, { useEffect, useState } from 'react';
import { LoginScreen } from '@/components/LoginScreen';
import { Dashboard } from '@/components/Dashboard';
import { isNativeHost } from '@/lib/webviewBridge';
import type { UserProfile } from '@/types';

export default function Home() {
  const [session, setSession] = useState<{ user: UserProfile } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for session info via API
    // In native mode, C# intercepts this and returns the "Offline Player" profile
    fetch('/api/auth')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) setSession({ user: data.user });
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Handle search params for error messages
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setError(err);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a]">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#00F2FE] animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen error={error ?? undefined} />;
  }

  return <Dashboard user={session.user} />;
}
