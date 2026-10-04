'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  floodFill,
  nextSymbol,
  paintCell,
  pushHistory,
  withColor,
} from '@/lib/pixelEdit';
import type { EditTool, Grid, PaletteColor, TransformResult } from '@/types';

export interface Cell {
  x: number;
  y: number;
}

interface UsePixelEditOptions {
  /** The transform the edits belong to; a new one discards them. */
  transform: TransformResult | null;
  /** Colour the eraser paints with (the "transparent background" setting). */
  background: string;
  /** Full chart symbol set, so an appended colour still gets a symbol. */
  symbolPool: string[];
}

interface EditState {
  /**
   * The transform these edits were made against.  Identity - not equality - is
   * the reset signal: every `/api/transform` response is a fresh object, so a
   * re-processed image can never inherit a grid of the wrong dimensions.
   */
  source: TransformResult | null;
  /** `null` means "pristine": render `transform.grid` as-is. */
  current: Grid | null;
  past: Grid[];
  future: Grid[];
  activeIndex: number | null;
  palette: PaletteColor[];
  symbols: string[];
}

const NO_HISTORY: Grid[] = [];

/**
 * Label given to the background colour when the eraser has to add it to the
 * palette.
 *
 * Palette labels are *data*, not interface copy - the backend already generates
 * English ones such as `Colour 1` - so this deliberately does not go through the
 * translation catalogue.
 */
const BACKGROUND_LABEL = 'Background';

function freshState(source: TransformResult | null): EditState {
  return {
    source,
    current: null,
    past: NO_HISTORY,
    future: NO_HISTORY,
    activeIndex: 0,
    palette: source?.palette ?? [],
    symbols: source?.symbols ?? [],
  };
}

export interface UsePixelEdit {
  /** The edited grid, or `null` when nothing has been edited. */
  grid: Grid | null;
  /** Palette to draw with - the source one, possibly with the background added. */
  palette: PaletteColor[];
  /** Chart symbols, kept the same length as `palette`. */
  symbols: string[];
  tool: EditTool;
  setTool: (tool: EditTool) => void;
  activeIndex: number | null;
  setActiveIndex: (index: number | null) => void;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  apply: (cell: Cell) => void;
  undo: () => void;
  redo: () => void;
  discard: () => void;
}

/**
 * Own the hand edits made on top of a server-produced grid, plus the undo stack.
 *
 * No backend work is needed to make an edit visible everywhere: `/api/pattern`
 * re-derives the legend, counts, chart and both text exports from whatever grid
 * it is handed, so the hook only has to expose the edited grid to the page and
 * let the existing (debounced) pattern sync pick it up.
 */
export function usePixelEdit({
  transform,
  background,
  symbolPool,
}: UsePixelEditOptions): UsePixelEdit {
  const [tool, setTool] = useState<EditTool>('inspect');
  const [edit, setEdit] = useState<EditState>(() => freshState(null));

  /*
   * Staleness is resolved during render rather than in an effect.  An effect
   * would run *after* the browser had already painted a frame of the previous
   * grid at the new transform's dimensions; deriving it here means that frame is
   * never committed.
   */
  const stale = edit.source !== transform;
  const state: EditState = stale ? freshState(transform) : edit;

  /** Re-base an update function onto the current transform, if it moved on. */
  const rebase = useCallback(
    (previous: EditState) => (previous.source === transform ? previous : freshState(transform)),
    [transform],
  );

  const apply = useCallback(
    (cell: Cell) => {
      setEdit((previous) => {
        const base = rebase(previous);
        const source = base.current ?? transform?.grid ?? null;
        if (!source) return previous;

        // The eyedropper only moves the selection - it is not an edit, so it
        // must not land on the undo stack.
        if (tool === 'eyedropper') {
          const picked = source[cell.y]?.[cell.x];
          if (picked === undefined || picked === base.activeIndex) return previous;
          return { ...base, activeIndex: picked };
        }

        if (tool === 'inspect' || base.activeIndex === null) return previous;

        let { palette, symbols, activeIndex } = base;

        if (tool === 'eraser') {
          const result = withColor(palette, background, BACKGROUND_LABEL);
          palette = result.palette;
          activeIndex = result.index;
          // A freshly appended colour needs a symbol too, or `/api/pattern`
          // would index past the end of the symbol array.
          if (result.palette !== base.palette) {
            symbols = [...symbols, nextSymbol(symbols, symbolPool)];
          }
        }

        const next =
          tool === 'fill'
            ? floodFill(source, cell.x, cell.y, activeIndex)
            : paintCell(source, cell.x, cell.y, activeIndex);

        // Same reference back: the click changed nothing, so do not spend a
        // history slot or a pattern round trip on it.
        if (next === source) return previous;

        return {
          ...base,
          current: next,
          past: pushHistory(base.past, source),
          future: NO_HISTORY,
          palette,
          symbols,
          activeIndex,
        };
      });
    },
    [background, rebase, symbolPool, tool, transform],
  );

  const undo = useCallback(() => {
    setEdit((previous) => {
      const base = rebase(previous);
      if (base.past.length === 0) return previous;

      return {
        ...base,
        current: base.past[base.past.length - 1],
        past: base.past.slice(0, -1),
        // `base.current` is non-null whenever there is something to undo: every
        // edit pushes the grid it replaced onto `past`.
        future: [...base.future, base.current as Grid],
      };
    });
  }, [rebase]);

  const redo = useCallback(() => {
    setEdit((previous) => {
      const base = rebase(previous);
      if (base.future.length === 0) return previous;

      return {
        ...base,
        current: base.future[base.future.length - 1],
        past: pushHistory(base.past, base.current as Grid),
        future: base.future.slice(0, -1),
      };
    });
  }, [rebase]);

  const discard = useCallback(() => {
    setEdit(freshState(transform));
  }, [transform]);

  const setActiveIndex = useCallback((index: number | null) => {
    setEdit((previous) =>
      previous.activeIndex === index ? previous : { ...previous, activeIndex: index },
    );
  }, []);

  /* --- Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z ------------------------------------- */

  // Whether there is anything the shortcuts could act on.  A single boolean
  // rather than the grid itself: `state` is a fresh object whenever the
  // transform is stale, and depending on that would rebind the listener on
  // every render.
  const hasEdits = state.current !== null || state.past.length > 0;

  useEffect(() => {
    if (!hasEdits) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      // `Ctrl+Y` is the Windows convention for redo and what people actually try.
      const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;

      // Never steal the shortcut from a field the user is typing in - the custom
      // palette box is a plain text input, where undo means something else.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      if (isUndo) undo();
      else redo();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasEdits, redo, undo]);

  return useMemo<UsePixelEdit>(
    () => ({
      grid: state.current,
      palette: state.palette,
      symbols: state.symbols,
      tool,
      setTool,
      activeIndex: state.activeIndex,
      setActiveIndex,
      // Every edit pushes the grid it replaced, so "there is something to undo"
      // is exactly "the grid no longer matches the server's".  Undoing all the
      // way back therefore clears the dirty flag on its own.
      isDirty: state.past.length > 0,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      apply,
      undo,
      redo,
      discard,
    }),
    [apply, discard, redo, setActiveIndex, state, tool, undo],
  );
}