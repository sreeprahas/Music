'use client';

import React from 'react';
import { Dashboard } from '@/components/Dashboard';
import type { UserProfile } from '@/types';

export default function Home() {
  const user: UserProfile = { name: 'Local Listener', email: 'local@music.app' };
  return <Dashboard user={user} />;
}
