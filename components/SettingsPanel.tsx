'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Disc3, LogOut, Palette, Upload, User, X, Youtube } from 'lucide-react';
import { THEME_PRESETS, type ThemeName, useTheme } from '@/components/ThemeProvider';
import type { UserProfile } from '@/types';

interface Props {
  user: UserProfile;
  onClose: () => void;
  onUserChange?: (user: UserProfile) => void;
  isOpen?: boolean;
}

type Category = 'account' | 'appearance';

const categories: Array<{ id: Category; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

export function SettingsPanel({ user, onClose, onUserChange, isOpen = true }: Props) {
  const { theme, setTheme } = useTheme();
  const [category, setCategory] = useState<Category>('account');
  const [isClosing, setIsClosing] = useState(false);

  const requestClose = () => {
    setIsClosing(true);
    window.setTimeout(() => { setIsClosing(false); onClose(); }, 180);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col bg-background ${isClosing ? 'animate-settings-out' : 'animate-settings-in'}`}>
      <header className="music-header relative flex h-[72px] shrink-0 items-center border-b border-border-subtle bg-background-secondary pl-1 pr-40 select-none">
        <button type="button" onClick={requestClose} className="settings-back-button relative z-10 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text transition hover:bg-surface-hover hover:text-accent pointer-events-auto" aria-label="Back to previous page">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold text-text">Settings</span>
      </header>
      <section className="relative flex min-h-0 flex-1 overflow-hidden bg-sidebar">
        <aside className="flex w-[142px] shrink-0 flex-col border-r border-border bg-sidebar p-2.5 sm:w-[190px] sm:p-4">
          <div className="mb-5 flex items-start justify-between gap-2 px-2 pt-1 sm:px-2">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] theme-accent">Settings</p><h1 className="mt-1 text-lg font-black theme-text">Preferences</h1></div>
          </div>
          <nav className="space-y-1" aria-label="Settings categories">
            {categories.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setCategory(id)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${category === id ? 'bg-accent/15 text-accent' : 'theme-muted hover:bg-surface hover:text-text'}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>)}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-background">
          <header className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-7 sm:py-5">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] theme-accent">Settings</p><h2 className="mt-1 text-xl font-black theme-text sm:text-2xl">{heading(category)}</h2><p className="mt-1 text-xs theme-muted sm:text-sm">{description(category)}</p></div>
          </header>
          <div className="max-w-2xl space-y-4 px-5 py-5 sm:px-7 sm:py-6">
            {category === 'account' ? <AccountPage user={user} onUserChange={onUserChange} /> : <ThemePage theme={theme} setTheme={setTheme} />}
          </div>
        </main>
      </section>
    </div>
  );
}

function heading(category: Category) { return category === 'account' ? 'Account' : 'Appearance'; }
function description(category: Category) { return category === 'account' ? 'Your profile and connected music services.' : 'Choose the accent color for Music.'; }

function Card({ children }: { children: React.ReactNode }) { return <section className="theme-surface rounded-2xl border border-border p-4 sm:p-5">{children}</section>; }

function AccountPage({ user, onUserChange }: { user: UserProfile; onUserChange?: (user: UserProfile) => void }) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [integrationMessage, setIntegrationMessage] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(user.name), [user.name]);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.name || saving) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/user/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) });
      if (!response.ok) throw new Error();
      const nextUser = await response.json() as UserProfile;
      onUserChange?.(nextUser); setMessage('Name updated.');
    } catch { setMessage('Could not update your name.'); }
    finally { setSaving(false); }
  };

  const placeholder = (service: string, action: string) => setIntegrationMessage(`${service} ${action} will be available soon.`);

  const savePhoto = async (pictureUrl: string) => {
    if (photoSaving) return;
    setPhotoSaving(true); setPhotoMessage('');
    try {
      const response = await fetch('/api/user/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: user.name, pictureUrl }) });
      if (!response.ok) throw new Error();
      onUserChange?.(await response.json() as UserProfile);
      setPhotoMessage(pictureUrl ? 'Profile photo updated.' : 'Profile photo removed.');
    } catch { setPhotoMessage('Could not update your profile photo.'); }
    finally { setPhotoSaving(false); }
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) { setPhotoMessage('Choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) { setPhotoMessage('Could not process that image.'); return; }
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        void savePhoto(canvas.toDataURL('image/webp', 0.84));
      };
      image.onerror = () => setPhotoMessage('Could not process that image.');
      image.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.onerror = () => setPhotoMessage('Could not read that image.');
    reader.readAsDataURL(file);
  };

  const photoUrl = user.picture || user.image || '';

  return <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        {photoUrl ? <img src={photoUrl} alt="Profile" className="h-14 w-14 rounded-full object-cover ring-2 ring-accent/25" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-xl font-black theme-accent">{user.name.charAt(0).toUpperCase()}</div>}
        <div className="min-w-0 flex-1"><h1 className="font-bold theme-text">Your profile</h1><p className="mt-1 text-xs theme-muted">Add a photo to personalize your profile.</p></div>
        <div className="flex items-center gap-2">
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoSaving} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-bold text-background transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Upload</button>
          {photoUrl && <button type="button" onClick={() => void savePhoto('')} disabled={photoSaving} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold theme-muted transition hover:border-error/40 hover:text-error disabled:cursor-not-allowed disabled:opacity-50"><X className="h-3.5 w-3.5" />Remove</button>}
        </div>
      </div>
      {photoMessage && <p className="mt-3 text-xs font-semibold theme-accent">{photoMessage}</p>}
      <form noValidate onSubmit={saveName} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1"><span className="mb-1.5 block text-xs font-bold theme-muted">Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} aria-required="true" spellCheck={false} className="h-11 w-full rounded-xl bg-surface border border-transparent px-4 text-sm text-text placeholder:text-text-muted outline-none focus:outline-none hover:border-accent/30 hover:bg-accent/10 hover:shadow-accent-soft focus:border-accent/45 focus:bg-accent/14 focus:shadow-accent-medium caret-accent transition-[background-color,box-shadow] duration-500 ease-out" /></label><button type="submit" disabled={!name.trim() || name.trim() === user.name || saving} className="h-11 rounded-xl bg-accent px-4 text-xs font-bold text-background transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Saving…' : 'Save name'}</button></form>
      {message && <p className="mt-3 text-xs font-semibold theme-accent">{message}</p>}
    </Card>

    <Card>
      <div className="flex items-start justify-between gap-4"><div><h3 className="font-bold theme-text">Integrations</h3><p className="mt-1 text-xs leading-5 theme-muted">Connect optional music services. These controls are placeholders for now.</p></div><Disc3 className="h-5 w-5 shrink-0 theme-muted" /></div>
      <div className="mt-4 space-y-2">
        <IntegrationRow icon={<img src="/youtube-mark.svg" alt="YouTube Music" className="h-4 w-4" />} service="YouTube Music" onConnect={() => placeholder('YouTube Music', 'connection')} onSignOut={() => placeholder('YouTube Music', 'sign out')} />
        <IntegrationRow icon={<img src="/spotify-logo.png" alt="Spotify" className="h-4 w-4 rounded-full" />} service="Spotify" onConnect={() => placeholder('Spotify', 'connection')} onSignOut={() => placeholder('Spotify', 'sign out')} />
      </div>
      {integrationMessage && <p className="mt-3 text-xs font-semibold theme-accent">{integrationMessage}</p>}
    </Card>
  </div>;
}

function IntegrationRow({ icon, service, onConnect, onSignOut }: { icon: React.ReactNode; service: string; onConnect: () => void; onSignOut: () => void }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"><div className="flex min-w-0 flex-1 items-center gap-2.5">{icon}<span className="truncate text-sm font-semibold text-text">{service}</span><span className="rounded-full bg-surface px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide theme-muted">Not connected</span></div><div className="flex items-center gap-2"><button type="button" onClick={onConnect} className="rounded-lg bg-accent/12 px-2.5 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/20">Connect</button><button type="button" onClick={onSignOut} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold theme-muted hover:bg-surface hover:text-text"><LogOut className="h-3 w-3" />Sign out</button></div></div>;
}

function ThemePage({ theme, setTheme }: { theme: ThemeName; setTheme: (theme: ThemeName) => void }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{THEME_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => setTheme(preset.id)} aria-label={`Use ${preset.name} appearance`} className={`group rounded-xl border p-2.5 text-left transition ${theme === preset.id ? 'border-accent bg-accent/10 ring-1 ring-accent/50' : 'border-border bg-surface hover:border-accent/60'}`}><span data-theme-preview={preset.id} className="theme-swatch block h-7 rounded-lg" /><span className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-text">{preset.name}</span>{theme === preset.id && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}</span><span className="mt-0.5 block truncate text-[10px] theme-muted">{preset.description}</span></button>)}</div>;
}
