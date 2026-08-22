'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpotifySyncActionReturn {
  /** Call this to request a Spotify sync with confirmation flow */
  requestSyncAction: (opts: { onConfirm: () => void }) => void;
  /** Whether the confirmation modal should be open */
  isModalOpen: boolean;
  /** Call when modal is cancelled/dismissed */
  handleModalCancel: (neverShowAgain: boolean) => void;
  /** Call when modal Continue button is clicked */
  handleModalContinue: (neverShowAgain: boolean) => void;
}

/**
 * Shared hook implementing the Spotify Sync Now confirmation flow.
 *
 * - Fetches `spotifySyncWarningDismissed` from SQLite on mount.
 * - If dismissed: calls `onConfirm` immediately, bypassing the modal.
 * - If not dismissed: opens the warning modal.
 *   - Any exit (Cancel, backdrop click, Escape) with checkbox checked: persists preference and does not sync.
 *   - Continue with checkbox checked: persists preference and executes `onConfirm`.
 */
export function useSpotifySyncAction(): UseSpotifySyncActionReturn {
  const [warningDismissed, setWarningDismissed] = useState<boolean | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pendingConfirmRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/settings')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setWarningDismissed(Boolean(data?.spotifySyncWarningDismissed));
      })
      .catch(() => {
        if (!cancelled) setWarningDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPreference = useCallback((dismissed: boolean) => {
    setWarningDismissed(dismissed);
    fetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotifySyncWarningDismissed: dismissed }),
    }).catch(() => undefined);
  }, []);

  const requestSyncAction = useCallback(
    ({ onConfirm }: { onConfirm: () => void }) => {
      if (warningDismissed === true) {
        onConfirm();
        return;
      }
      pendingConfirmRef.current = onConfirm;
      setIsModalOpen(true);
    },
    [warningDismissed],
  );

  const handleModalCancel = useCallback(
    (neverShowAgain: boolean) => {
      setIsModalOpen(false);
      pendingConfirmRef.current = null;
      if (neverShowAgain) {
        persistPreference(true);
      }
    },
    [persistPreference],
  );

  const handleModalContinue = useCallback(
    (neverShowAgain: boolean) => {
      const confirmFn = pendingConfirmRef.current;
      setIsModalOpen(false);
      pendingConfirmRef.current = null;
      if (neverShowAgain) {
        persistPreference(true);
      }
      if (confirmFn) {
        confirmFn();
      }
    },
    [persistPreference],
  );

  return { requestSyncAction, isModalOpen, handleModalCancel, handleModalContinue };
}

