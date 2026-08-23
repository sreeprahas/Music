'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Disc3, Music2 } from 'lucide-react';

interface NamePromptModalProps {
  onSubmit: (name: string) => Promise<void>;
}

export function NamePromptModal({ onSubmit }: NamePromptModalProps) {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [integrationMessage, setIntegrationMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    setError('');
    try {
      await onSubmit(trimmedName);
    } catch {
      setError('Could not save your name. Please try again.');
      setIsSaving(false);
    }
  };

  const showPlaceholder = (service: string) => {
    setIntegrationMessage(`${service} connection is coming soon. You can continue without it.`);
  };

  return (
    <main className="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center overflow-y-auto bg-background px-4 py-6 sm:px-6">
      <div className="w-full max-w-[430px]">
        <section role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="overflow-hidden rounded-2xl border border-border bg-sidebar px-6 py-7 text-text shadow-2xl sm:px-8 sm:py-8">

          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent"><Music2 size={20} /></div>
              <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--music-accent)]">Welcome to Music</p><p className="mt-1 text-xs text-text-muted">Your music, gathered in one place.</p></div>
            </div>

            <div className="mt-8">
              <h1 id="welcome-title" className="text-2xl font-semibold leading-tight tracking-tight text-text">What should we call you?</h1>
              <p className="mt-2 max-w-[350px] text-sm leading-6 text-text-secondary">Choose a name for your Music profile.</p>
            </div>

            <form noValidate onSubmit={handleSubmit} className="mt-7">
              <label htmlFor="listener-name" className="text-sm font-medium text-text">Name</label>
              <input id="listener-name" ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} aria-required="true" spellCheck={false} maxLength={60} autoComplete="name" placeholder="Your name" className="mt-2 h-11 w-full rounded-xl bg-surface border border-transparent pl-4 pr-4 text-sm text-text placeholder:text-text-muted outline-none focus:outline-none hover:border-accent/30 hover:bg-accent/10 hover:shadow-accent-soft focus:border-accent/45 focus:bg-accent/14 focus:shadow-accent-medium caret-accent transition-[background-color,box-shadow] duration-500 ease-out disabled:opacity-70" />
              {error && <p className="mt-3 text-xs font-semibold text-[var(--color-error)]">{error}</p>}
              <button type="submit" disabled={!name.trim() || isSaving} className="mt-4 h-12 w-full rounded-xl bg-accent px-4 text-sm font-semibold text-background transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40">{isSaving ? 'Saving…' : 'Continue'}</button>
            </form>

            <div className="my-7 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-disabled">Integrations</span><div className="h-px flex-1 bg-border" /></div>

            <div>
              <div className="flex items-end justify-between gap-4"><div><h2 className="text-base font-extrabold text-text">Integrations</h2><p className="mt-1 text-xs leading-5 text-text-muted">Connect your music services whenever you’re ready.</p></div><Disc3 size={21} className="mb-1 text-text-disabled" /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => showPlaceholder('YouTube Music')} className="group flex h-12 items-center gap-3 rounded-2xl border border-border bg-surface/40 px-4 text-left transition hover:border-[var(--music-accent)] hover:bg-surface-hover"><img src="/youtube-mark.svg" alt="" className="h-[19px] w-[19px] object-contain" /><span className="min-w-0 flex-1 text-xs font-bold text-text-secondary group-hover:text-text">YouTube Music</span><span className="text-[9px] font-bold uppercase tracking-wide text-text-disabled">Soon</span></button>
                <button type="button" onClick={() => showPlaceholder('Spotify')} className="group flex h-12 items-center gap-3 rounded-2xl border border-border bg-surface/40 px-4 text-left transition hover:border-[var(--music-accent)] hover:bg-surface-hover"><img src="/spotify-logo.png" alt="" className="h-[19px] w-[19px] rounded-full object-contain" /><span className="min-w-0 flex-1 text-xs font-bold text-text-secondary group-hover:text-text">Spotify</span><span className="text-[9px] font-bold uppercase tracking-wide text-text-disabled">Soon</span></button>
              </div>
              {integrationMessage && <p className="mt-3 text-center text-[11px] font-medium text-[var(--music-accent)]">{integrationMessage}</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
