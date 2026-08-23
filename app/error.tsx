'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Music] page error:', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-text">
      <section className="w-full max-w-md rounded-3xl border border-border bg-sidebar p-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-xl text-accent">♪</div>
        <h1 className="text-xl font-bold">Music could not start</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">The page ran into a temporary problem. Try loading it again.</p>
        <button type="button" onClick={() => reset()} className="mt-6 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-background transition hover:bg-accent-hover">
          Try again
        </button>
      </section>
    </main>
  );
}
