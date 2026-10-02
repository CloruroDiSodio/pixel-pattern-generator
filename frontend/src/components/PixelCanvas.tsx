'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { PaletteColor } from '@/types';

interface PixelCanvasProps {
  grid: number[][];
  palette: PaletteColor[];
  /** Zoom level of the on-screen canvas (independent of the export scale). */
  zoom: number;
  showGridLines: boolean;
  onPick?: (color: PaletteColor, cell: { x: number; y: number }) => void;
}

interface Hover {
  x: number;
  y: number;
}

/**
 * Draws the pixel grid onto a `<canvas>`.
 *
 * A canvas (instead of a grid of divs) keeps 200×200 previews smooth, and
 * drawing is done imperatively so React only re-renders on data changes.
 */
function PixelCanvas({
  grid,
  palette,
  zoom,
  showGridLines,
  onPick,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const height = grid.length;
  const width = height > 0 ? (grid[0]?.length ?? 0) : 0;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * zoom * ratio;
    canvas.height = height * zoom * ratio;
    canvas.style.width = `${width * zoom}px`;
    canvas.style.height = `${height * zoom}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width * zoom, height * zoom);

    for (let y = 0; y < height; y += 1) {
      const row = grid[y] ?? [];
      for (let x = 0; x < width; x += 1) {
        const color = palette[row[x] ?? 0];
        if (!color) continue;
        context.fillStyle = color.hex;
        context.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }

    if (showGridLines && zoom >= 5) {
      for (let x = 0; x <= width; x += 1) {
        const major = x % 10 === 0;
        context.strokeStyle = major ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x * zoom + 0.5, 0);
        context.lineTo(x * zoom + 0.5, height * zoom);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 1) {
        const major = y % 10 === 0;
        context.strokeStyle = major ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, y * zoom + 0.5);
        context.lineTo(width * zoom, y * zoom + 0.5);
        context.stroke();
      }
    }
  }, [grid, palette, height, width, zoom, showGridLines]);

  useEffect(() => {
    paint();
  }, [paint]);

  // Re-draw on zoom / palette changes and after a container resize.
  useEffect(() => {
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, [paint]);

  const cellFromEvent = (event: React.MouseEvent<HTMLCanvasElement>): Hover | null => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / zoom);
    const y = Math.floor((event.clientY - bounds.top) / zoom);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y };
  };

  const hoveredColor = hover ? palette[grid[hover.y]?.[hover.x] ?? 0] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="font-mono">
          {width} × {height} cells
        </span>
        {hover && hoveredColor ? (
          <span className="chip">
            <span
              className="mr-2 inline-block h-3 w-3 rounded-sm border border-ink-600"
              style={{ backgroundColor: hoveredColor.hex }}
            />
            {hoveredColor.label} · {hoveredColor.hex} · ({hover.x + 1}, {hover.y + 1})
          </span>
        ) : (
          <span>Hover to inspect a cell · click to copy its hex value</span>
        )}
      </div>

      <div className="panel overflow-auto p-3">
        <canvas
          ref={canvasRef}
          className="pixelated cursor-crosshair rounded-sm shadow-lg"
          onMouseMove={(event) => setHover(cellFromEvent(event))}
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const cell = cellFromEvent(event);
            if (!cell) return;
            const color = palette[grid[cell.y]?.[cell.x] ?? 0];
            if (color) onPick?.(color, cell);
          }}
          role="img"
          aria-label={`Pixel preview, ${width} by ${height} cells, ${palette.length} colours`}
        />
      </div>
    </div>
  );
}

// Repaints up to 200x200 cells, so it must not re-render when unrelated
// parent state (zoom, toast, view tab) changes.
export default memo(PixelCanvas);
