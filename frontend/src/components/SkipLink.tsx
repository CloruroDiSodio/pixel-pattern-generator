'use client';

import { useTranslate } from '@/components/I18nProvider';

/**
 * Keyboard shortcut past the header controls.
 *
 * Must be a client component: it reads the active locale, and `layout.tsx`
 * itself is a Server Component where hooks are unavailable.
 */
export default function SkipLink() {
  const t = useTranslate();

  return (
    <a
      href="#studio"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
        focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-white"
    >
      {t('skipToStudio')}
    </a>
  );
}