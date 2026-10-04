/**
 * Supported locales.
 *
 * Adding a language is three steps: append its code here, add a `LOCALE_META`
 * entry, and drop a dictionary next to `en.ts`. The `TranslationKey` type then
 * enforces that the new catalogue covers every string.
 */
export const LOCALES = ['en', 'it'] as const;

export type Locale = (typeof LOCALES)[number];

/** Used when the browser reports nothing we recognise, and before hydration. */
export const DEFAULT_LOCALE: Locale = 'en';

export interface LocaleMeta {
  /** Name in English, for tooling and debugging. */
  english: string;
  /** Endonym, so the picker is readable to the people who speak the language. */
  native: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  en: { english: 'English', native: 'English' },
  it: { english: 'Italian', native: 'Italiano' },
};

/** Narrow an arbitrary value (e.g. `localStorage`) to a supported locale. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the best supported locale for the browser.
 *
 * Matches the primary subtag, so `it-CH` and `it_IT` both resolve to Italian.
 */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  for (const tag of languages ?? []) {
    const primary = tag.split('-')[0]?.toLowerCase();
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}