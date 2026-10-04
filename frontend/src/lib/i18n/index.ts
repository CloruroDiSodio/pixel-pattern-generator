import { DEFAULT_LOCALE, type Locale } from './config';
import { en, type TranslationKey } from './en';
import { it } from './it';

export { DEFAULT_LOCALE, LOCALES, LOCALE_META, detectLocale, isLocale } from './config';
export type { Locale, LocaleMeta } from './config';
export type { TranslationKey } from './en';

/** Values accepted as `{placeholder}` substitutions. */
export type TranslationParams = Record<string, string | number>;

export const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, it };

/** Signature of the `t()` function exposed by `useI18n`. */
export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Substitute `{name}` placeholders.
 *
 * Numbers go through `Intl.NumberFormat`, which is why Italian renders
 * `12.345 stitches` where English renders `12,345 stitches`.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const template = DICTIONARIES[locale][key] ?? DICTIONARIES[DEFAULT_LOCALE][key];
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number'
      ? new Intl.NumberFormat(locale).format(value)
      : String(value);
  });
}

/**
 * An error whose human-readable text lives in the catalogue.
 *
 * Thrown by low-level modules (canvas export, API client) that must not import
 * React, then rendered through `localizeError()` in the UI.
 */
export class LocalizedError extends Error {
  readonly key: TranslationKey;
  readonly params?: TranslationParams;

  constructor(key: TranslationKey, params?: TranslationParams) {
    super(key);
    this.name = 'LocalizedError';
    this.key = key;
    this.params = params;
  }
}

/**
 * Render any thrown value as a sentence in the active locale.
 *
 * `LocalizedError` and `ApiError` (with a catalogue key) become translated
 * strings; anything else - including the plain-English `detail` returned by the
 * FastAPI backend - falls back to its own message, which is still better than
 * swallowing the reason.
 */
export function localizeError(t: Translate, error: unknown): string {
  if (error instanceof LocalizedError) return t(error.key, error.params);
  if (error instanceof Error) {
    const key = (error as { key?: TranslationKey }).key;
    const params = (error as { params?: TranslationParams }).params;
    if (key) return t(key, params);
    return error.message;
  }
  return typeof error === 'string' ? error : t('status.unexpected');
}