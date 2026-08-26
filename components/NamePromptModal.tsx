'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Disc3, Upload } from 'lucide-react';

interface NamePromptModalProps {
  onSubmit: (name: string, profilePhoto?: File | null) => Promise<void>;
}

export function NamePromptModal({ onSubmit }: NamePromptModalProps) {
  const [name, setName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [integrationMessage, setIntegrationMessage] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!profilePhoto) {
      setProfilePhotoPreview('');
      return;
    }

    const previewUrl = URL.createObjectURL(profilePhoto);
    setProfilePhotoPreview(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [profilePhoto]);

  const handleProfilePhotoChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be smaller than 5 MB.');
      event.target.value = '';
      return;
    }

    setError('');
    setProfilePhoto(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    setError('');

    try {
      /*
       * Pass BOTH the name and actual File object to the parent.
       * The parent must update the shared profile state/header.
       */
      await onSubmit(trimmedName, profilePhoto);
    } catch {
      setError('Could not save your profile. Please try again.');
      setIsSaving(false);
    }
  };

  const showPlaceholder = (service: string) => {
    setIntegrationMessage(
      `${service} connection is coming soon. You can continue without it.`,
    );
  };

  const profileInitial = name.trim()
    ? name.trim().charAt(0).toUpperCase()
    : 'S';

  return (
    <main className="fixed inset-0 z-[200] min-h-dvh overflow-hidden bg-background px-4 py-6 sm:px-6">
      {/* Header — exact home-header branding, draggable in Electron */}
      <header
        className="music-header absolute inset-x-0 top-0 z-30 flex h-[72px] items-center border-b border-border-subtle bg-background-secondary pl-6 pr-40 select-none"
        style={
          {
            WebkitAppRegion: 'drag',
          } as React.CSSProperties & {
            WebkitAppRegion: string;
          }
        }
      >
        <button
          type="button"
          title="Music"
          className="group flex cursor-pointer items-center gap-2"
          style={
            {
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties & {
              WebkitAppRegion: string;
            }
          }
        >
          {/* Header logo */}
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-cyan-400/20 bg-black/20 shadow-[0_0_18px_rgba(34,211,238,0.12)] transition-all duration-500 ease-out group-hover:scale-105 group-hover:shadow-accent-card">
            <span
              aria-hidden="true"
              className="music-logo-mark block h-8 w-8"
            />
          </div>

          <span className="text-text text-lg font-black tracking-tight transition-colors group-hover:text-accent">
            Music
          </span>
        </button>
      </header>

      {/* Centered modal with a soft multi-color glow border */}
      <div className="relative z-10 flex min-h-dvh w-full items-center justify-center pt-[71px]">
        <div className="relative w-full max-w-[430px]">
          {/* Broad ambient glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[10px] rounded-[32px] bg-[conic-gradient(from_220deg_at_50%_50%,#67e8f9_0deg,#818cf8_70deg,#f0abfc_145deg,#fde68a_215deg,#86efac_285deg,#67e8f9_360deg)] opacity-40 blur-[24px]"
          />

          {/* Tight luminous rim */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[1px] rounded-[27px] bg-[conic-gradient(from_220deg_at_50%_50%,#67e8f9_0deg,#818cf8_70deg,#f0abfc_145deg,#fde68a_215deg,#86efac_285deg,#67e8f9_360deg)] opacity-80"
          />

          {/* Opaque card */}
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-sidebar px-6 py-7 text-text shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:px-8 sm:py-8"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[26px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.055),transparent_42%)]"
            />

            <div className="relative">
              {/* Welcome branding */}
              <div className="flex items-center gap-3">
                {/* Modal logo */}
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-cyan-400/20 bg-[#071418] shadow-[0_0_20px_rgba(34,211,238,0.14)]">
                  <span
                    aria-hidden="true"
                    className="music-logo-mark block h-10 w-10"
                  />
                </div>

                <div>
                  <p className="text-[20px] font-bold leading-tight tracking-tight text-[var(--music-accent)]">
                    Welcome to Music
                  </p>

                  <p className="mt-1 text-xs text-text-muted">
                    Your music, gathered in one place.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <h1
                  id="welcome-title"
                  className="text-2xl font-semibold leading-tight tracking-tight text-text"
                >
                  What should we call you?
                </h1>

                <p className="mt-2 max-w-[350px] text-sm leading-6 text-text-secondary">
                  Choose a name for your Music profile.
                </p>
              </div>

              <form noValidate onSubmit={handleSubmit} className="mt-7">
                {/* Minimal settings-style profile section */}
                <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-surface/30 px-3 py-2.5">
                  {/* Avatar — display only, not clickable */}
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-cyan-400/10">
                    {profilePhotoPreview ? (
                      <img
                        src={profilePhotoPreview}
                        alt="Profile preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-lg font-bold text-[var(--music-accent)]">
                        {profileInitial}
                      </span>
                    )}
                  </div>

                  {/* Profile information */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold leading-5 text-text">
                      Your profile
                    </p>

                    <p className="mt-0.5 text-[11px] leading-4 text-text-muted">
                      Add a photo to personalize your profile.
                    </p>
                  </div>

                  {/* Upload */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-background transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload size={14} strokeWidth={2.2} />
                    <span>Upload</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePhotoChange}
                    className="hidden"
                  />
                </div>

                {/* Name */}
                <label
                  htmlFor="listener-name"
                  className="text-sm font-medium text-text"
                >
                  Name
                </label>

                <input
                  id="listener-name"
                  ref={inputRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isSaving}
                  aria-required="true"
                  spellCheck={false}
                  maxLength={60}
                  autoComplete="name"
                  placeholder="Your Name"
                  className="mt-2 h-11 w-full rounded-xl border border-transparent bg-surface pl-4 pr-4 text-sm text-text outline-none placeholder:text-text-muted caret-accent transition-[background-color,box-shadow] duration-500 ease-out hover:border-accent/30 hover:bg-accent/10 hover:shadow-accent-soft focus:border-accent/45 focus:bg-accent/14 focus:shadow-accent-medium focus:outline-none disabled:opacity-70"
                />

                {error && (
                  <p className="mt-3 text-xs font-semibold text-[var(--color-error)]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!name.trim() || isSaving}
                  className="mt-4 h-12 w-full rounded-xl bg-accent px-4 text-sm font-semibold text-background transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSaving ? 'Saving…' : 'Continue'}
                </button>
              </form>

              {/* Integrations divider */}
              <div className="my-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />

                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-disabled">
                  Integrations
                </span>

                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Integrations */}
              <div>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-base font-extrabold text-text">
                      Integrations
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-text-muted">
                      Connect your music services whenever you’re ready.
                    </p>
                  </div>

                  <Disc3
                    size={21}
                    className="mb-1 text-text-disabled"
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {/* YouTube Music */}
                  <button
                    type="button"
                    onClick={() => showPlaceholder('YouTube Music')}
                    className="group flex h-12 items-center gap-3 rounded-2xl border border-border bg-surface/40 px-4 text-left transition hover:border-[var(--music-accent)] hover:bg-surface-hover"
                  >
                    <img
                      src="/youtube-mark.svg"
                      alt=""
                      className="h-[19px] w-[19px] object-contain"
                    />

                    <span className="min-w-0 flex-1 text-xs font-bold text-text-secondary group-hover:text-text">
                      YouTube Music
                    </span>

                    <span className="text-[9px] font-bold uppercase tracking-wide text-text-disabled">
                      Soon
                    </span>
                  </button>

                  {/* Spotify */}
                  <button
                    type="button"
                    onClick={() => showPlaceholder('Spotify')}
                    className="group flex h-12 items-center gap-3 rounded-2xl border border-border bg-surface/40 px-4 text-left transition hover:border-[var(--music-accent)] hover:bg-surface-hover"
                  >
                    <img
                      src="/spotify-logo.png"
                      alt=""
                      className="h-[19px] w-[19px] rounded-full object-contain"
                    />

                    <span className="min-w-0 flex-1 text-xs font-bold text-text-secondary group-hover:text-text">
                      Spotify
                    </span>

                    <span className="text-[9px] font-bold uppercase tracking-wide text-text-disabled">
                      Soon
                    </span>
                  </button>
                </div>

                {integrationMessage && (
                  <p className="mt-3 text-center text-[11px] font-medium text-[var(--music-accent)]">
                    {integrationMessage}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}