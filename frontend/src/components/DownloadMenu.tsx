import { memo, useState } from 'react';

import { useI18n } from '@/components/I18nProvider';
import {
  downloadBlob,
  downloadText,
  renderGridToPng,
  slugify,
} from '@/lib/download';
import type { PatternResult, TransformResult } from '@/types';

interface DownloadMenuProps {
  transform: TransformResult | null;
  pattern: PatternResult | null;
  title: string;
  disabled?: boolean;
}

const EXPORT_SCALES = [16, 32, 64, 128] as const;

/** Export buttons for the PNG, CSV, Markdown and JSON artefacts. */
function DownloadMenu({ transform, pattern, title, disabled }: DownloadMenuProps) {
  const [scale, setScale] = useState<number>(32);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { t, localizeError } = useI18n();

  if (!transform) return null;

  const base = slugify(title);

  const exportPng = async () => {
    if (!transform) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await renderGridToPng({
        grid: transform.grid,
        palette: transform.palette,
        scale,
        gridLines: transform.settings?.grid_lines ?? true,
      });
      downloadBlob(blob, `${base}-${scale}x.png`);
      setMessage(t('export.saved', { file: `${base}-${scale}x.png` }));
    } catch (error) {
      setMessage(localizeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="field-label">{t('export.title')}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void exportPng()}
          disabled={disabled || busy}
        >
          {t('export.png', { scale })}
        </button>

        <select
          className="select w-auto"
          value={scale}
          onChange={(event) => setScale(Number(event.target.value))}
          aria-label={t('export.pngScaleLabel')}
          disabled={disabled || busy}
        >
          {EXPORT_SCALES.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!pattern) return;
            downloadText(pattern.csv, `${base}.csv`, 'text/csv');
            setMessage(t('export.saved', { file: `${base}.csv` }));
          }}
          disabled={disabled || !pattern}
        >
          {t('export.csv')}
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!pattern) return;
            downloadText(pattern.markdown, `${base}.md`, 'text/markdown');
            setMessage(t('export.saved', { file: `${base}.md` }));
          }}
          disabled={disabled || !pattern}
        >
          {t('export.markdown')}
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => {
            downloadText(JSON.stringify(transform, null, 2), `${base}.json`, 'application/json');
            setMessage(t('export.saved', { file: `${base}.json` }));
          }}
          disabled={disabled}
        >
          {t('export.json')}
        </button>
      </div>

      {message ? <p className="text-xs text-slate-400">{message}</p> : null}
    </div>
  );
}

export default memo(DownloadMenu);
