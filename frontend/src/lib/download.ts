/** Client-side helpers for exporting the generated grid and pattern. */

import type { PaletteColor } from '@/types';

/** Turn an arbitrary project name into a safe, lowercase file name. */
export function slugify(value: string, fallback = 'pixel-pattern'): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download plain text (CSV, Markdown, JSON). */
export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Download a `data:` URI (the backend preview PNG). */
export async function downloadDataUri(dataUri: string, filename: string): Promise<void> {
  const response = await fetch(dataUri);
  downloadBlob(await response.blob(), filename);
}

export interface RenderGridOptions {
  grid: number[][];
  palette: PaletteColor[];
  /** Pixels per cell. */
  scale?: number;
  gridLines?: boolean;
  /** Draw a heavier line every 10 cells. */
  majorLineEvery?: number;
  background?: string;
}

/**
 * Render a pixel grid to a PNG blob at an arbitrary scale.
 *
 * The backend already returns a preview, but it is capped at 40x; this lets the
 * user export a print-ready 64x or 128x PNG straight from the browser.
 */
export async function renderGridToPng({
  grid,
  palette,
  scale = 32,
  gridLines = true,
  majorLineEvery = 10,
  background = '#ffffff',
}: RenderGridOptions): Promise<Blob> {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  if (width === 0 || height === 0) {
    throw new Error('Nothing to export: the grid is empty.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available in this browser.');
  }

  context.imageSmoothingEnabled = false;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    const row = grid[y] ?? [];
    for (let x = 0; x < width; x += 1) {
      const color = palette[row[x] ?? 0];
      if (!color) continue;
      context.fillStyle = color.hex;
      context.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  if (gridLines && scale >= 4) {
    for (let x = 0; x <= width; x += 1) {
      const major = x % majorLineEvery === 0;
      context.strokeStyle = major ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)';
      context.lineWidth = major ? Math.max(1, scale / 16) : 1;
      const position = Math.round(x * scale) + 0.5;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, canvas.height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 1) {
      const major = y % majorLineEvery === 0;
      context.strokeStyle = major ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)';
      context.lineWidth = major ? Math.max(1, scale / 16) : 1;
      const position = Math.round(y * scale) + 0.5;
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(canvas.width, position);
      context.stroke();
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the PNG.'));
    }, 'image/png');
  });
}

/** Pick a readable foreground colour for a swatch background. */
export function contrastText(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#000000';
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.55 ? '#0b0b0f' : '#ffffff';
}

/** Human readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
