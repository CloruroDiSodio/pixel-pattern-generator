'use client';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useI18n } from '@/components/I18nProvider';

interface HeaderProps {
  /** Result of the periodic `/api/health` probe. */
  backendOnline: boolean | null;
  apiUrl: string;
}

/** Top bar: title, tagline, language picker and a live backend indicator. */
export default function Header({ backendOnline, apiUrl }: HeaderProps) {
  const { t } = useI18n();

  const state =
    backendOnline === null
      ? { dot: 'bg-slate-500', text: t('header.apiChecking') }
      : backendOnline
        ? { dot: 'bg-mint', text: t('header.apiOnline') }
        : { dot: 'bg-rose', text: t('header.apiOffline') };

  return (
    <header className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 grid-cols-4 gap-[2px] rounded-xl bg-ink-800 p-2 shadow-panel"
        >
          {[
            'bg-accent',
            'bg-mint',
            'bg-amber',
            'bg-rose',
            'bg-mint',
            'bg-accent',
            'bg-rose',
            'bg-amber',
            'bg-amber',
            'bg-rose',
            'bg-accent',
            'bg-mint',
            'bg-accent',
            'bg-mint',
            'bg-amber',
            'bg-rose',
          ].map((colour, index) => (
            <span key={index} className={`rounded-[1px] ${colour}`} />
          ))}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {t('header.title')}
          </h1>
          <p className="text-sm text-slate-400">{t('header.tagline')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <LocaleSwitcher />
        <span
          className="chip"
          title={`Backend: ${apiUrl}`}
          data-testid="backend-status"
          data-state={backendOnline === null ? 'pending' : backendOnline ? 'online' : 'offline'}
        >
          <span className={`mr-2 h-2 w-2 rounded-full ${state.dot}`} />
          {state.text}
        </span>
        <a
          className="btn btn-ghost"
          href={`${apiUrl}/docs`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('header.apiDocs')}
        </a>
      </div>
    </header>
  );
}
