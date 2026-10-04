'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  DEFAULT_LOCALE,
  detectLocale,
  isLocale,
  localizeError,
  translate,
  type Locale,
  type Translate,
} from '@/lib/i18n';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  /** Turn any thrown value into a sentence in the active locale. */
  localizeError: (error: unknown) => string;
  /** `Intl` locale tag, for `toLocaleString()` and friends. */
  intlLocale: string;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Namespace with the rest of the persisted client state. */
const STORAGE_KEY = 'ppg.locale';

/**
 * Holds the active locale and exposes the translation helpers.
 *
 * The choice is persisted in `localStorage`; on a first visit (or after the
 * stored value is unusable) it falls back to the browser's preferred language.
 * The very first paint always renders `DEFAULT_LOCALE` so the server and client
 * markup match, and `<html lang>` is corrected in an effect right after mount.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useLocalStorage<string>(STORAGE_KEY, '');

  const locale = useMemo(() => (isLocale(stored) ? stored : DEFAULT_LOCALE), [stored]);

  // `useLocalStorage` applies the persisted value in an effect of its own, so
  // `stored` only becomes trustworthy on the render *after* mount. Waiting for
  // that keeps the browser-language fallback below from overwriting a choice
  // the user has already made.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (hydrated && !isLocale(stored)) {
      setStored(detectLocale(navigator.languages));
    }
  }, [hydrated, stored, setStored]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => setStored(next),
    [setStored],
  );

  const t = useCallback<Translate>(
    (key, params) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t,
      localizeError: (error: unknown) => localizeError(t, error),
      intlLocale: locale,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the active locale and `t()`. Throws outside of `I18nProvider`. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside an <I18nProvider>.');
  }
  return value;
}

/** Shorthand for components that only need the `t()` function. */
export function useTranslate(): Translate {
  return useI18n().t;
}