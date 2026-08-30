'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Track } from '@/types';
import { X, Link2, Loader2 } from 'lucide-react';

interface OverrideResult {
  videoId: string;
  title?: string;
  artist?: string;
  duration?: number;
  thumbnailUrl?: string;
  localThumbnailUrl?: string;
}

interface Props {
  track: Track;
  onClose: () => void;
  /** Called with the original track and the resolved YouTube metadata. */
  onSaved: (track: Track, result: OverrideResult) => void;
}

/**
 * Modal for manually overriding the YouTube source of a track by pasting a
 * YouTube video link. Works for both Spotify-sourced tracks (persisted via
 * the spotify_youtube_map) and tracks that already carry a videoId.
 */
export function MatchOverrideModal({ track, onClose, onSaved }: Props) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/matching/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: track.videoId,
          sourceTrackId: track.sourceTrackId,
          youtubeUrl: trimmed,
          title: track.title,
          artist: track.artist,
          duration: track.duration,
          // Old metadata so the server can clean up the previous videoId's
          // cached audio, global thumbnail, and saved lyrics.
          oldVideoId: track.videoId,
          oldArtist: track.artist,
          oldTitle: track.title,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Could not save the YouTube link');
      }
      onSaved(track, {
        videoId: data.videoId as string,
        title: data.title as string | undefined,
        artist: data.artist as string | undefined,
        duration: typeof data.duration === 'number' ? data.duration : undefined,
        thumbnailUrl: data.thumbnailUrl as string | undefined,
        localThumbnailUrl: data.localThumbnailUrl as string | undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the YouTube link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-overlay/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-fadeIn">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link2 className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-text truncate">Set YouTube link</h3>
              <p className="text-xs text-text-muted truncate">{track.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-text-muted hover:text-text p-1 rounded-lg hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Paste a YouTube video link to use as the audio source for this song. Playback and
            downloads will use this link instead of the automatic match.
          </p>

          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(''); }}
            placeholder="https://www.youtube.com/watch?v=…"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors placeholder:text-text-disabled"
          />

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-text-muted hover:bg-surface-hover hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim() || saving}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-background hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Save link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}