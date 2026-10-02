'use client';

import type { ReactNode } from 'react';

interface StatusBannerProps {
  error?: string | null;
  loading?: boolean;
  children?: ReactNode;
}

/** Inline feedback area: spinner while working, red panel on failure. */
export default function StatusBanner({ error, loading, children }: StatusBannerProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose"
      >
        <span aria-hidden="true">⚠️</span>
        <div>
          <p className="font-medium">Something went wrong</p>
          <p className="mt-0.5 text-rose/90">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm text-slate-400"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-ink-500 border-t-accent-soft"
        />
        Processing…
      </div>
    );
  }

  return <>{children}</>;
}
