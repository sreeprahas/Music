'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface Props {
  onCancel: (neverShowAgain: boolean) => void;
  onContinue: (neverShowAgain: boolean) => void;
}

/**
 * Spotify sync warning modal.
 *
 * Message: "Sync to restore this playlist from Spotify. Any local changes you make to this playlist will be overwritten by the Spotify playlist."
 * Checkbox: "Never show this warning again"
 * Buttons: "Cancel" and "Continue"
 * Dismiss via: Cancel, Continue, Backdrop click, Escape key, or Close button.
 * The neverShowAgain state is always reported on any exit.
 */
export function SpotifySyncConfirmModal({ onCancel, onContinue }: Props) {
  const [neverShow, setNeverShow] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel(neverShow);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [neverShow, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel(neverShow);
      }}
    >
      <div
        className="relative w-[480px] max-w-[calc(100vw-32px)] rounded-2xl border border-border bg-surface shadow-2xl shadow-shadow/80 p-6 flex flex-col gap-5 animate-dropdown-in"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => onCancel(neverShow)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/15 shrink-0">
            <RefreshCw className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text leading-tight">Sync with Spotify?</h2>
          </div>
        </div>

        {/* Warning body */}
        <p className="text-sm text-text-secondary leading-relaxed">
          Sync to restore this playlist from Spotify. Any local changes you make to this playlist will be overwritten by the Spotify playlist.
        </p>

        {/* Never show again checkbox */}
        <label className="flex items-center gap-2.5 cursor-pointer group select-none">
          <input
            type="checkbox"
            checked={neverShow}
            onChange={(e) => setNeverShow(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-accent cursor-pointer shrink-0"
          />
          <span className="text-sm text-text-secondary group-hover:text-text transition-colors">
            Never show this warning again
          </span>
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => onCancel(neverShow)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary border border-border hover:bg-surface-hover hover:text-text transition-all duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onContinue(neverShow)}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-background hover:bg-accent-hover shadow-sm shadow-accent/30 hover:shadow-accent-medium transition-all duration-200"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

