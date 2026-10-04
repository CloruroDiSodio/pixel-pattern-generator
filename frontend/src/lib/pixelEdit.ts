import type { Grid, PaletteColor } from '@/types';

/**
 * Client-side pixel editing primitives.
 *
 * These are deliberately pure functions with no React and no dependency on the
 * rest of the studio: the editor hook owns the state, this module owns the
 * maths.  Every helper that returns a grid returns the *same* array reference
 * when nothing actually changes, which is what lets the hook skip a history
 * entry (and a debounced `/api/pattern` round trip) for a no-op click.
 *
 * Nothing here mutates its input.  Rows are shared between a grid and the grids
 * derived from it and are only ever copied before being written to, so a value
 * parked in the undo stack can never be corrupted by later edits.
 */

/** Upper bound on the undo stack, so a long painting session cannot grow it forever. */
export const MAX_HISTORY = 50;

/**
 * Paint a single cell.
 *
 * Returns `grid` unchanged when the cell is out of bounds or already holds the
 * requested palette index.
 */
export function paintCell(grid: Grid, x: number, y: number, index: number): Grid {
  const row = grid[y];
  if (!row || x < 0 || y < 0 || x >= row.length || y >= grid.length) return grid;
  if (row[x] === index) return grid;

  const next = grid.slice();
  next[y] = row.slice();
  next[y][x] = index;
  return next;
}

/**
 * 4-connected bucket fill starting at `(x, y)`.
 *
 * Region membership is tested against the *original* grid while the result is
 * written into a copy, so the flood cannot "walk back out" through cells it has
 * just repainted - the classic bug that makes a fill bounce between two colours.
 *
 * Bounds are re-checked against each row's own length rather than a single grid
 * width: the backend always emits rectangular grids, but a defensive check here
 * costs nothing and keeps a malformed grid from throwing mid-edit.
 */
export function floodFill(grid: Grid, x: number, y: number, index: number): Grid {
  const startRow = grid[y];
  if (!startRow || x < 0 || y < 0 || x >= startRow.length) return grid;

  const target = startRow[x];
  if (target === index) return grid;

  const next = grid.map((row) => row.slice());
  const pending: Array<[number, number]> = [[x, y]];

  while (pending.length > 0) {
    const [cellX, cellY] = pending.pop() as [number, number];
    const row = next[cellY];
    if (!row || cellX < 0 || cellY < 0 || cellX >= row.length) continue;
    if (row[cellX] === index) continue;
    if (grid[cellY][cellX] !== target) continue;

    row[cellX] = index;
    pending.push([cellX + 1, cellY], [cellX - 1, cellY], [cellX, cellY + 1], [cellX, cellY - 1]);
  }

  return next;
}

/**
 * Recompute per-colour cell counts for a (possibly hand-edited) grid.
 *
 * The backend derives counts, percentages and the legend from the grid it
 * produced.  Once the user paints, those numbers are stale, and the palette
 * strip would show percentages that no longer add up.  The palette *order* and
 * its symbols are left untouched: re-ordering would renumber the grid and
 * desync the chart.
 */
export function recountPalette(grid: Grid, palette: PaletteColor[]): PaletteColor[] {
  const counts = new Array<number>(palette.length).fill(0);

  for (const row of grid) {
    for (const value of row) {
      if (Number.isInteger(value) && value >= 0 && value < counts.length) {
        counts[value] += 1;
      }
    }
  }

  return palette.map((color, index) =>
    color.count === counts[index] ? color : { ...color, count: counts[index] },
  );
}

/** Normalise `"abc"` / `"#ABC"` / `"#aabbcc"` to `#AABBCC`, falling back to white. */
export function normalizeHex(value: string, fallback = '#FFFFFF'): string {
  const candidate = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(candidate)) {
    return `#${candidate
      .split('')
      .map((char) => char + char)
      .join('')}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(candidate)) return `#${candidate}`.toUpperCase();
  return fallback;
}

/**
 * Return the index of `hex` in `palette`, appending it when absent.
 *
 * The eraser writes the background colour into cells, but that colour is not
 * guaranteed to be one of the quantiser's choices - so it has to be addable.
 * The returned `palette` is the *same reference* when nothing was appended,
 * which the hook uses to decide whether the symbols need extending too.
 */
export function withColor(
  palette: PaletteColor[],
  hex: string,
  label: string,
): { palette: PaletteColor[]; index: number } {
  const normalized = normalizeHex(hex);
  const existing = palette.findIndex((color) => color.hex === normalized);
  if (existing >= 0) return { palette, index: existing };

  return {
    palette: [...palette, { hex: normalized, count: 0, label }],
    index: palette.length,
  };
}

/** First unused chart symbol, so an appended colour still has one to draw with. */
export function nextSymbol(used: string[], pool: string[]): string {
  return pool.find((symbol) => !used.includes(symbol)) ?? '?';
}

/** Append to the undo stack, dropping the oldest step once it is full. */
export function pushHistory(past: Grid[], grid: Grid): Grid[] {
  const next = past.length >= MAX_HISTORY ? past.slice(past.length - MAX_HISTORY + 1) : past.slice();
  next.push(grid);
  return next;
}