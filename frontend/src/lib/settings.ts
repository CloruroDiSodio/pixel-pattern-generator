import type { TransformSettings } from '@/types';

/** Factory defaults for the conversion pipeline (also the "Reset" target). */
export const DEFAULT_SETTINGS: TransformSettings = {
  grid_width: 32,
  max_colors: 16,
  resize_mode: 'pixelate',
  quantize_method: 'mediancut',
  dither: 'none',
  palette: 'auto',
  custom_palette: '',
  background: '',
  palette_sort: 'usage',
  grid_lines: true,
};

/** Used until `/api/options` answers (or if the backend is unreachable). */
export const FALLBACK_LIMITS = {
  minGridSize: 4,
  maxGridSize: 200,
  maxColors: 40,
  maxPreviewScale: 40,
  maxImageBytes: 15 * 1024 * 1024,
};
