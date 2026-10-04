'use client';

import { useId } from 'react';

import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n';

import { useI18n } from './I18nProvider';

interface LocaleSwitcherProps {
  className?: string;
}

/**
 * Language picker for the header.
 *
 * A native `<select>` rather than a custom menu: it is keyboard accessible and
 * screen-reader friendly for free, and it behaves like the platform control on
 * mobile. Options are labelled in their own language so a visitor can find
 * their language by reading it rather than translating the list.
 */
export default function LocaleSwitcher({ className = '' }: LocaleSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const id = useId();

  return (
    <label className={`flex items-center gap-2 text-xs text-slate-400 ${className}`.trim()} htmlFor={id}>
      <span className="sr-only sm:not-sr-only">{t('header.language')}</span>
      <select
        id={id}
        className="select w-auto py-1 text-xs"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('header.language')}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_META[code].native}
          </option>
        ))}
      </select>
    </label>
  );
}