/** On-screen canvas zoom, in pixels per cell. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;

/**
 * `PixelCanvas` renders the canvas inside a `p-3` scroll panel, so this much of
 * the panel's client box is padding rather than drawable canvas.
 */
const PANEL_PADDING = 24;

/**
 * Largest whole-pixel zoom at which the entire grid fits the visible width.
 *
 * Only width is considered: the scroll panel has no height cap, so it grows to
 * whatever the canvas needs and never clips vertically.
 *
 * @param available Width of the scroll panel's client box, in CSS pixels.
 * @param gridWidth Width of the grid in cells.
 */
export function fitZoom(available: number, gridWidth: number): number {
  if (gridWidth <= 0 || available <= 0) return MIN_ZOOM;
  const usable = available - PANEL_PADDING;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.floor(usable / gridWidth)));
}