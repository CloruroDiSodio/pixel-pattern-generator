'use client';

import { memo, useState } from 'react';

import { useTranslate } from '@/components/I18nProvider';
import { contrastText } from '@/lib/download';
import type { PaletteColor } from '@/types';

interface PaletteStripProps {
  palette: PaletteColor[];
  symbols?: string[];
  totalCells: number;
  /** Palette index the paint and fill tools will use. */
  activeIndex?: number | null;
  /** Arms a colour for painting (the editor's "pick from palette"). */
  onSelect?: (color: PaletteColor, index: number) => void;
  /** Copies a hex value to the clipboard. */
  onCopy?: (color: PaletteColor) => void;
}

/**
 * The generated palette with per-colour usage percentages.
 *
 * Two actions hang off a swatch, so they are split deliberately: clicking arms
 * the colour for painting (the editor's primary use), while copying moved to the
 * detail line underneath.  Nesting a button inside the swatch button would have
 * been invalid markup and a confusing focus order - the same problem the
 * dropzone had.
 */
function PaletteStrip({
  palette,
  symbols,
  totalCells,
  activeIndex = null,
  onSelect,
  onCopy,
}: PaletteStripProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const t = useTranslate();

  if (palette.length === 0) return null;

  // The armed colour takes precedence: once the user has picked a swatch, that
  // is what the detail line describes even while the pointer is elsewhere.
  const described = hovered ?? activeIndex;
  const describedColor = described !== null ? palette[described] : undefined;

  return (
    <div>
      <h3 className="field-label">
        {t('palette.title')}{' '}
        <span className="font-mono text-[11px] normal-case text-slate-400">
          {t('palette.colours', { count: palette.length })}
        </span>
      </h3>
      <ul className="flex flex-wrap gap-2">
        {palette.map((color, index) => {
          const percent = totalCells > 0 ? (color.count / totalCells) * 100 : 0;
          const symbol = symbols?.[index];
          const isActive = activeIndex === index;
          return (
            <li key={`${color.hex}-${index}`}>
              <button
                type="button"
                title={t('palette.swatchTitle', {
                  label: color.label,
                  hex: color.hex,
                  count: color.count,
                  percent: percent.toFixed(1),
                })}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => onSelect?.(color, index)}
                aria-pressed={onSelect ? isActive : undefined}
                className={`group relative flex h-14 w-14 flex-col items-center justify-center rounded-lg border text-xs
                  font-semibold transition hover:scale-105 focus:scale-105 ${
                    isActive
                      ? 'border-accent-soft ring-2 ring-accent-soft'
                      : hovered === index
                        ? 'border-accent-soft'
                        : 'border-ink-600'
                  }`}
                style={{ backgroundColor: color.hex, color: contrastText(color.hex) }}
              >
                {symbol ? <span className="font-mono text-sm leading-none">{symbol}</span> : null}
                <span className="mt-0.5 text-[10px] font-normal opacity-80">
                  {percent >= 9.95 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {describedColor && described !== null ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="font-medium text-white">{describedColor.label}</span>
          <span className="font-mono">{describedColor.hex}</span>
          <span>{t('palette.cells', { count: describedColor.count })}</span>
          {onCopy ? (
            <button
              type="button"
              className="btn btn-ghost px-2 py-0.5 text-[11px]"
              onClick={() => onCopy(describedColor)}
            >
              {t('palette.copy')}
            </button>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          {onSelect ? t('palette.hintEdit') : t('palette.hint')}
        </p>
      )}
    </div>
  );
}

export default memo(PaletteStrip);
