'use client';

import { useEffect, useState } from 'react';

import { buildPattern } from '@/lib/api';
import { useI18n } from '@/components/I18nProvider';
import type { Grid, PaletteColor, PatternOptions, PatternResult, TransformResult } from '@/types';

import { useDebouncedValue } from './useDebouncedValue';

/**
 * A grid that replaces the server's, together with the palette and symbols it
 * needs.
 *
 * The three travel together because they are a unit: appending the background
 * colour to the palette (eraser) shifts every symbol by one, so sending a
 * re-painted grid without its matching symbols would make `/api/pattern` index
 * past the end of the symbol array.
 */
export interface GridOverride {
  grid: Grid;
  palette: PaletteColor[];
  symbols: string[];
}

interface UsePatternSync {
  pattern: PatternResult | null;
  error: string | null;
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Drive `POST /api/pattern` - the cross-stitch chart, legend and text exports.
 *
 * `override` is what makes the pixel editor work without any backend change:
 * `/api/pattern` re-derives every count, percentage, symbol and document from
 * whatever grid it is handed, so handing it a hand-edited one keeps the whole
 * craft pipeline and both exports in sync for free.
 *
 * The debounce matters more here than on the transform call: a drag across the
 * canvas produces a new grid per pointer event.  `/api/pattern` is *not* rate
 * limited (only `/api/transform` is), but there is no reason to ask for a chart
 * nobody is going to look at until the stroke ends.
 */
export function usePatternSync(
  transform: TransformResult | null,
  patternOptions: PatternOptions,
  override: GridOverride | null,
  enabled = true,
): UsePatternSync {
  const [pattern, setPattern] = useState<PatternResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, localizeError } = useI18n();

  const debouncedOptions = useDebouncedValue(patternOptions, 300);
  const debouncedOverride = useDebouncedValue(override, 250);

  useEffect(() => {
    if (!transform) setPattern(null);
  }, [transform]);

  useEffect(() => {
    if (!enabled || !transform) return undefined;

    const controller = new AbortController();
    const grid = debouncedOverride?.grid ?? transform.grid;
    const palette = debouncedOverride?.palette ?? transform.palette;
    const symbols = debouncedOverride?.symbols ?? transform.symbols;

    buildPattern(grid, palette, symbols, debouncedOptions, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPattern(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbort(cause)) return;
        setPattern(null);
        setError(localizeError(cause) || t('status.patternFailedShort'));
      });

    return () => controller.abort();
  }, [transform, debouncedOverride, debouncedOptions, enabled, localizeError, t]);

  return { pattern, error };
}