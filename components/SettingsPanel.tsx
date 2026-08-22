'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Database, ExternalLink, Gauge, X, User, Palette, Layers, Radio, Sparkles } from 'lucide-react';
import { THEME_PRESETS, type ThemeName, useTheme } from '@/components/ThemeProvider';
import type { UserProfile } from '@/types';

interface Props {
  user: UserProfile;
  onClose: () => void;
  isOpen?: boolean;
  onRefreshData?: () => Promise<void> | void;
}

type Category = 'account' | 'appearance' | 'themes' | 'library' | 'downloads' | 'connections' | 'advanced';

const categories: Array<{ id: Category; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'themes', label: 'Theme accents', icon: Sparkles },
  { id: 'library', label: 'Library & Cache', icon: Layers },
  { id: 'downloads', label: 'Storage', icon: Database },
  { id: 'connections', label: 'Transport', icon: Radio },
  { id: 'advanced', label: 'Advanced', icon: ShieldCheck },
];

export function SettingsPanel({ user, onClose, isOpen = true, onRefreshData }: Props) {
  const { theme, setTheme } = useTheme();
  const [category, setCategory] = useState<Category>('appearance');
  const [isClosing, setIsClosing] = useState(false);
  const [message, setMessage] = useState('');

  const requestClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  const refreshSpotifyData = async () => {
    try {
      setMessage('Refreshing Spotify data...');
      if (onRefreshData) await onRefreshData();
      setMessage('Spotify metadata refreshed successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Refresh failed.');
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={requestClose} />
      <section className="relative flex h-[90vh] max-h-[820px] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-sidebar shadow-2xl">
        <aside className="w-[220px] shrink-0 border-r border-border bg-sidebar p-4 sm:w-[260px] sm:p-6">
          <div className="mb-7 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] theme-muted">Settings</p>
              <h1 className="mt-1 text-xl font-black theme-text">User settings</h1>
            </div>
            <button type="button" onClick={requestClose} className="rounded-lg p-2 theme-muted hover:bg-surface hover:text-text sm:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="space-y-1" aria-label="Settings categories">
            {categories.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${category === id ? 'bg-accent/15 text-accent' : 'theme-muted hover:bg-surface hover:text-text'}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto hidden border-t border-border pt-5 text-xs theme-muted sm:block">
            <p className="font-semibold theme-text">Music</p>
            <p className="mt-1">Local Library</p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto bg-background">
          <header className="flex items-center justify-between border-b border-border px-5 py-5 sm:px-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] theme-accent">{heading(category)}</p>
              <h2 className="mt-1 text-2xl font-black theme-text">{heading(category)}</h2>
              <p className="mt-1 text-sm theme-muted">{description(category)}</p>
            </div>
            <button type="button" onClick={requestClose} className="hidden rounded-lg p-2 theme-muted hover:bg-surface hover:text-text sm:block">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="max-w-3xl space-y-5 px-5 py-6 sm:px-10 sm:py-8">
            {category === 'account' && <AccountPage user={user} />}
            {category === 'appearance' && <AppearancePage />}
            {category === 'themes' && <ThemePage theme={theme} setTheme={setTheme} />}
            {category === 'library' && <LibraryPage onRefresh={refreshSpotifyData} message={message} />}
            {category === 'downloads' && <DownloadsPage />}
            {category === 'connections' && <ConnectionsPage />}
            {category === 'advanced' && <AdvancedPage />}
          </div>
        </main>
      </section>
    </div>
  );
}

function heading(category: Category) {
  return categories.find((item) => item.id === category)?.label || 'Settings';
}

function description(category: Category) {
  return ({
    account: 'Your local profile and app identity.',
    appearance: 'Tune the way Music feels and behaves.',
    themes: 'Choose a centralized accent system for the entire app.',
    library: 'Manage metadata and local library refreshes.',
    downloads: 'Understand local audio and metadata storage.',
    connections: 'Inspect the configured provider connections.',
    advanced: 'Runtime details and safe troubleshooting.',
  })[category];
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="theme-surface rounded-xl border border-border p-5">{children}</section>;
}

function AccountPage({ user }: { user: UserProfile }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-xl font-black theme-accent">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className="font-bold theme-text">{user.name}</h3>
          <p className="text-sm theme-muted">{user.email}</p>
        </div>
      </div>
      <p className="mt-6 text-sm leading-6 theme-muted">
        This installation uses a local listener profile. Provider sign-in buttons are intentionally unavailable because the app has no provider-token flow.
      </p>
    </Card>
  );
}

function AppearancePage() {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <Gauge className="mt-0.5 h-5 w-5 theme-accent" />
        <div>
          <h3 className="font-bold theme-text">Focused desktop layout</h3>
          <p className="mt-1 text-sm leading-6 theme-muted">
            The header, library sidebar, and player use opaque semantic surfaces so content remains readable in every theme.
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-background p-4 text-sm theme-muted">
        Playback controls stay in the player bar. Settings only contains preferences and configuration.
      </div>
    </Card>
  );
}

function ThemePage({ theme, setTheme }: { theme: ThemeName; setTheme: (theme: ThemeName) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {THEME_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => setTheme(preset.id)}
          className={`theme-surface rounded-xl border p-4 text-left transition-colors ${theme === preset.id ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-accent/60'}`}
        >
          <span data-theme-preview={preset.id} className="theme-swatch mb-4 block h-2 rounded-full" />
          <p className="font-bold text-text">{preset.name}</p>
          <p className="mt-1 text-xs text-text-muted">{preset.description}</p>
          {theme === preset.id && <p className="mt-3 text-xs font-bold text-accent">Currently selected</p>}
        </button>
      ))}
    </div>
  );
}

function LibraryPage({ onRefresh, message }: { onRefresh: () => void; message: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold theme-text">Metadata cache</h3>
          <p className="mt-1 text-sm theme-muted">
            Refresh cached home and profile data from the configured providers.
          </p>
        </div>
        <button type="button" onClick={onRefresh} className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-background hover:bg-accent-hover">
          Refresh
        </button>
      </div>
      {message && <p className="mt-4 text-xs theme-accent">{message}</p>}
    </Card>
  );
}

function DownloadsPage() {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <Database className="mt-0.5 h-5 w-5 theme-accent" />
        <div>
          <h3 className="font-bold theme-text">Local storage</h3>
          <p className="mt-1 text-sm leading-6 theme-muted">
            Downloaded audio, thumbnails, lyrics, playlist metadata, and provider responses stay in the app's local data directory. Temporary stream URLs are never treated as permanent cache entries.
          </p>
        </div>
      </div>
    </Card>
  );
}

function ConnectionsPage() {
  const [transport, setTransport] = useState<{
    spotify?: { configured: boolean; status: string; description: string };
    youtube?: { configured: boolean; status: string; description: string };
    packageVersion?: string;
  }>({});

  useEffect(() => {
    fetch('/api/settings/transport', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setTransport)
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      {/* Spotify provider card */}
      <Card>
        <div className="flex items-start gap-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 theme-accent" />
          <div>
            <h3 className="font-bold theme-text">Providers</h3>
            <p className="mt-1 text-sm leading-6 theme-muted">
              Spotify playlist importing via embed preview & guest token. YouTube playback & search via GraphQL / YouTube Music.
            </p>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <Status
                label="Spotify Embed & Guest"
                state={transport.spotify}
                statusText={transport.spotify?.status || 'ready'}
              />
              <Status
                label="YouTube GraphQL"
                state={transport.youtube}
                statusText={transport.youtube?.status || 'configured'}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Status({
  label,
  state,
  statusText,
}: {
  label: string;
  state?: { configured: boolean };
  statusText: string;
}) {
  const ready = Boolean(state?.configured);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 theme-muted">
      <span className={`h-2 w-2 rounded-full ${ready ? 'bg-accent' : 'bg-warning'}`} />
      {label}: {statusText}
    </div>
  );
}

function AdvancedPage() {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <ExternalLink className="mt-0.5 h-5 w-5 theme-accent" />
        <div>
          <h3 className="font-bold theme-text">Provider diagnostics</h3>
          <p className="mt-1 text-sm leading-6 theme-muted">
            Spotify operations are managed through the application-owned provider interface and local Electron worker.
          </p>
          <p className="mt-4 text-xs theme-muted">
            Provider: SQLite & Local Storage · Transport: Native Data.
          </p>
        </div>
      </div>
    </Card>
  );
}
