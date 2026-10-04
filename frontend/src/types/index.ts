/**
 * Types shared by the UI and the FastAPI backend.
 *
 * The wire format is camelCase (the Python side serialises dataclasses with
 * explicit camelCase keys); local-only settings use snake_case so they match
 * the backend dataclass field names exactly.
 */

/* -------------------------------------------------------------------------- */
/* API responses                                                              */
/* -------------------------------------------------------------------------- */

export interface PaletteColor {
  /** Uppercase `#RRGGBB` string. */
  hex: string;
  /** Number of grid cells using this colour. */
  count: number;
  /** Human readable name, e.g. "Dark Blue". */
  label: string;
}

export interface TransformResult {
  /** Grid width in cells. */
  width: number;
  /** Grid height in cells. */
  height: number;
  originalWidth: number;
  originalHeight: number;
  palette: PaletteColor[];
  /** `grid[y][x]` is an index into `palette`. */
  grid: Grid;
  /** Chart symbol per palette index. */
  symbols: string[];
  /**
   * `data:image/png;base64,...` rendered by the backend.
   *
   * Optional: the API only produces it when the request sets `preview=true`.
   * The studio renders its own canvas from `grid` + `palette`, so it never
   * asks for it.
   */
  previewPng?: string;
  processingMs: number;
  settings: TransformSettings & Record<string, unknown>;
}

export interface PatternLegendEntry {
  index: number;
  hex: string;
  label: string;
  symbol: string;
  count: number;
  percent: number;
}

export interface PatternResult {
  title: string;
  width: number;
  height: number;
  repeatX: number;
  repeatY: number;
  totalStitches: number;
  rowLabels: string[];
  columnLabels: string[];
  /** `grid[y][x]` is a chart symbol. */
  grid: string[][];
  legend: PatternLegendEntry[];
  csv: string;
  markdown: string;
}

export interface PaletteDefinition {
  id: string;
  name: string;
  description: string;
  colors: PaletteColor[];
}

export interface PalettesResponse {
  palettes: PaletteDefinition[];
  symbols: string[];
}

export interface ApiOptions {
  resizeModes: string[];
  quantizeMethods: string[];
  ditherModes: string[];
  paletteSorts: string[];
  symbols: string[];
  limits: {
    minGridSize: number;
    maxGridSize: number;
    maxColors: number;
    maxPreviewScale: number;
    maxImageBytes: number;
  };
  defaults: TransformSettings;
}

/* -------------------------------------------------------------------------- */
/* Local state                                                                */
/* -------------------------------------------------------------------------- */

export type ResizeMode = 'pixelate' | 'sample' | 'smooth';
export type QuantizeMethod = 'mediancut' | 'maxcoverage' | 'fastoctree' | 'libimagequant';
export type DitherMode = 'none' | 'floyd_steinberg' | 'bayer';
export type PaletteSort = 'usage' | 'luminance' | 'hex';
export type PaletteId = 'auto' | 'custom' | (string & {});

/** `grid[y][x]` is an index into the palette. */
export type Grid = number[][];

/**
 * Tools available on the pixel canvas.
 *
 * `inspect` is the tool the canvas has always used - hover to read a cell, click
 * to copy its hex value - kept as the default so editing is strictly additive and
 * the existing click-to-copy behaviour is never taken away from the user.
 */
export type EditTool = 'inspect' | 'paint' | 'eyedropper' | 'fill' | 'eraser';

export interface TransformSettings {
  grid_width: number;
  max_colors: number;
  resize_mode: ResizeMode;
  quantize_method: QuantizeMethod;
  dither: DitherMode;
  palette: PaletteId;
  custom_palette: string;
  background: string;
  palette_sort: PaletteSort;
  grid_lines: boolean;
}

export interface UploadedImage {
  file: File;
  /** Object URL for the browser preview. */
  url: string;
  width: number;
  height: number;
  name: string;
  /** Bytes, shown next to the file name. */
  size: number;
}

export interface PatternOptions {
  title: string;
  repeatX: number;
  repeatY: number;
}

export type ViewMode = 'pixels' | 'pattern';

export interface ApiErrorPayload {
  detail?: string | Array<{ msg?: string; loc?: (string | number)[] }>;
}
