'use client';

import { memo, useMemo, useState } from 'react';

import { contrastText } from '@/lib/download';
import type { PatternResult } from '@/types';

interface CraftPatternProps {
  pattern: PatternResult | null;
  loading: boolean;
}

/**
 * Above this cell count the chart is not rendered as a DOM table: a 200×200
 * grid is 40,000 `<td>` elements, which locks up the main thread and is
 * unusable with a screen reader anyway. The chart is still available through
 * the CSV / Markdown exports, which is what a maker would actually stitch from.
 */
const MAX_RENDERED_CELLS = 12_000;

/**
 * Printable cross-stitch / craft chart: numbered margins, a symbol per cell and
 * a colour legend with stitch counts.
 */
function CraftPattern({ pattern, loading }: CraftPatternProps) {
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  const tooLarge = useMemo(
    () => (pattern ? pattern.width * pattern.height > MAX_RENDERED_CELLS : false),
    [pattern],
  );

  if (!pattern) {
    return (
      <div className="panel flex min-h-[18rem] items-center justify-center p-8 text-sm text-slate-400">
        {loading ? 'Building the pattern chart…' : 'The pattern chart appears once an image is processed.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="chip">
          {pattern.width} × {pattern.height} stitches
        </span>
        <span className="chip">{pattern.totalStitches.toLocaleString()} total</span>
        {pattern.repeatX > 1 || pattern.repeatY > 1 ? (
          <span className="chip">
            repeated {pattern.repeatX} × {pattern.repeatY}
          </span>
        ) : null}
      </div>

      {tooLarge ? (
        <div
          role="status"
          className="panel flex flex-col items-center gap-2 border-amber/40 bg-amber/5 p-8 text-center"
        >
          <p className="text-sm font-medium text-amber">
            Chart too large to display ({pattern.width.toLocaleString()} ×{' '}
            {pattern.height.toLocaleString()} cells)
          </p>
          <p className="max-w-md text-sm text-slate-400">
            Rendering {(pattern.width * pattern.height).toLocaleString()} cells would freeze the
            browser. The full chart is still included in the CSV and Markdown exports below, and
            works fine in a spreadsheet or chart viewer.
          </p>
        </div>
      ) : (
        <div className="panel overflow-auto p-3">
          <table className="border-collapse font-mono text-[10px] leading-none">
            <caption className="sr-only">{pattern.title} pattern chart</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-20 bg-ink-900 p-1" />
                {pattern.columnLabels.map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="sticky top-0 z-10 bg-ink-900 px-0 py-1 font-normal text-slate-400"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pattern.grid.map((row, y) => (
                <tr key={y}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-ink-900 pr-2 text-right font-normal text-slate-400"
                  >
                    {pattern.rowLabels[y]}
                  </th>
                  {row.map((symbol, x) => (
                    <td
                      key={`${y}-${x}`}
                      onMouseEnter={() => setActiveSymbol(symbol)}
                      onMouseLeave={() => setActiveSymbol(null)}
                      className={`h-5 w-5 border border-ink-800 text-center transition ${
                        activeSymbol === symbol ? 'bg-accent/30 text-white' : 'text-slate-300'
                      }`}
                    >
                      {symbol}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="field-label">
          Legend <span className="font-mono text-[11px] normal-case text-slate-400">{pattern.legend.length} threads</span>
        </h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {pattern.legend.map((entry) => (
            <li
              key={entry.index}
              className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-2 py-1.5"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-ink-600 font-mono text-xs font-semibold"
                style={{ backgroundColor: entry.hex, color: contrastText(entry.hex) }}
              >
                {entry.symbol}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-slate-200">{entry.label}</span>
                <span className="block font-mono text-[10px] text-slate-400">{entry.hex}</span>
              </span>
              <span className="text-right text-[11px] text-slate-400">
                <span className="block font-medium text-slate-200">{entry.count}</span>
                {entry.percent.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// The chart can hold thousands of nodes and is re-rendered on every parent
// state change (zoom, view toggle, toast) unless it is memoised.
export default memo(CraftPattern);
