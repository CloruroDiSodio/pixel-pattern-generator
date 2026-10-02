'use client';

import { memo, useState } from 'react';

import { contrastText } from '@/lib/download';
import type { PaletteColor } from '@/types';

interface PaletteStripProps {
  palette: PaletteColor[];
  symbols?: string[];
  totalCells: number;
  onSelect?: (color: PaletteColor) => void;
}

/** The generated palette with per-colour usage percentages. */
function PaletteStrip({ palette, symbols, totalCells, onSelect }: PaletteStripProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (palette.length === 0) return null;

  return (
    <div>
      <h3 className="field-label">
        Palette <span className="font-mono text-[11px] normal-case text-slate-400">{palette.length} colours</span>
      </h3>
      <ul className="flex flex-wrap gap-2">
        {palette.map((color, index) => {
          const percent = totalCells > 0 ? (color.count / totalCells) * 100 : 0;
          const symbol = symbols?.[index];
          return (
            <li key={`${color.hex}-${index}`}>
              <button
                type="button"
                title={`${color.label} — ${color.hex} — ${color.count} cells (${percent.toFixed(1)}%)`}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => onSelect?.(color)}
                className={`group relative flex h-14 w-14 flex-col items-center justify-center rounded-lg border text-xs
                  font-semibold transition hover:scale-105 focus:scale-105 ${
                    hovered === index ? 'border-accent-soft' : 'border-ink-600'
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

      {hovered !== null && palette[hovered] ? (
        <p className="mt-2 text-xs text-slate-400">
          <span className="font-medium text-white">{palette[hovered].label}</span> ·{' '}
          <span className="font-mono">{palette[hovered].hex}</span> · {palette[hovered].count} cells
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          Click a swatch to copy its hex value.
        </p>
      )}
    </div>
  );
}

export default memo(PaletteStrip);
