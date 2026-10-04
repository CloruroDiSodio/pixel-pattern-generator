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

/**
 * The thread a palette colour was matched onto.
 *
 * `null`/`undefined` means no brand was requested, which is the default: the app
 * has always worked in plain colours and that must stay free.
 */
export interface PatternThread {
  /** Display name of the brand, e.g. "DMC". */
  brand: string;
  /** The thread's own code, e.g. "310" or "B5200". */
  code: string;
  /** Thread name, e.g. "Black". */
  name: string;
  /** The thread's own hex, which is close to - but not always - the swatch. */
  hex: string;
  /** Whole skeins to buy, `0` for a colour left with no stitches. */
  skeins: number;
}

export interface PatternLegendEntry {
  index: number;
  hex: string;
  label: string;
  symbol: string;
  count: number;
  percent: number;
  thread?: PatternThread | null;
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
  /** The brand the palette was matched against, `"none"` when off. */
  threadBrand: ThreadBrandId;
  /** Fabric count the skein estimate assumes. */
  fabricCount: number;
  /** Stitches one skein covers, `null` when no brand is selected. */
  stitchesPerSkein: number | null;
}

export interface PaletteDefinition {
  id: string;
  name: string;
  description: string;
  colors: PaletteColor[];
}

/** A thread brand advertised by `/api/options` (the table itself is far too big). */
export interface ThreadBrandInfo {
  id: string;
  name: string;
  description: string;
  /** How many shades the table holds. */
  colors: number;
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
  /** Thread brands the legend can be matched against (`none` is implicit). */
  threadBrands: ThreadBrandInfo[];
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

/**
 * Thread brand for the pattern legend. `'none'` is not a brand but the absence
 * of one, and it is the default.
 */
export type ThreadBrandId = 'none' | (string & {});

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

/**
 * Options for the craft pattern - the chart, the legend and the text exports.
 *
 * `threadBrand` lives here rather than in `TransformSettings` on purpose: the
 * brand does not change a single pixel, so it has no business re-running
 * `/api/transform` (and discarding the editor's hand edits with it). It travels
 * with the pattern options, which re-post `/api/pattern` and nothing else.
 */
export interface PatternOptions {
  title: string;
  repeatX: number;
  repeatY: number;
  threadBrand: ThreadBrandId;
}

export type ViewMode = 'pixels' | 'pattern';

export interface ApiErrorPayload {
  detail?: string | Array<{ msg?: string; loc?: (string | number)[] }>;
}
