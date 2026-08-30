'use client';

import { useEffect, useState } from 'react';

/**
 * Delays a "show skeleton" state by `delayMs` so a quick load never flashes
 * a placeholder — only loads that take longer than the threshold become
 * visible to the user.
 *
 * Pass the raw `isLoading` flag from the caller. Returns `true` only after
 * `delayMs` of continuous loading, and `false` as soon as loading ends.
 */
export function useDelayedLoading(isLoading: boolean, delayMs: number = 100): boolean {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), delayMs);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  return showSkeleton;
}
