import type {
  ApiErrorPayload,
  ApiOptions,
  PalettesResponse,
  PatternOptions,
  PatternResult,
  PaletteColor,
  TransformResult,
  TransformSettings,
} from '@/types';

/**
 * Base URL of the FastAPI backend.
 *
 * Set `NEXT_PUBLIC_API_URL` in `.env.local` for development and in the Netlify
 * environment variables for production (the value is inlined at build time).
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '');

/** Error thrown for every non-2xx response so the UI can show `message`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function describe(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const detail = (payload as ApiErrorPayload).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first?.msg) {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : undefined;
        return field ? `${String(field)}: ${first.msg}` : first.msg;
      }
    }
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
      0,
    );
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError(describe(payload, `Request failed (${response.status})`), response.status);
  }

  return (await response.json()) as T;
}

/** `GET /api/health` - used for the connection indicator. */
export async function fetchHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const body = await request<{ status: string }>('/api/health', { signal });
    return body.status === 'ok';
  } catch {
    return false;
  }
}

/** `GET /api/options` - supported values and limits. */
export function fetchApiOptions(signal?: AbortSignal): Promise<ApiOptions> {
  return request<ApiOptions>('/api/options', { signal });
}

/** `GET /api/palettes` - bundled presets. */
export function fetchPalettes(signal?: AbortSignal): Promise<PalettesResponse> {
  return request<PalettesResponse>('/api/palettes', { signal });
}

/**
 * `POST /api/transform` - upload an image and receive the pixel grid.
 *
 * The backend expects camelCase multipart fields; only non-empty values are
 * sent so the server side defaults apply to everything else.
 */
export function transformImage(
  file: File,
  settings: TransformSettings,
  signal?: AbortSignal,
): Promise<TransformResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('gridWidth', String(settings.grid_width));
  form.append('maxColors', String(settings.max_colors));
  form.append('resizeMode', settings.resize_mode);
  form.append('quantizeMethod', settings.quantize_method);
  form.append('dither', settings.dither);
  form.append('palette', settings.palette);
  form.append('paletteSort', settings.palette_sort);
  form.append('previewScale', String(settings.preview_scale));
  form.append('gridLines', String(settings.grid_lines));
  if (settings.custom_palette.trim()) {
    form.append('customPalette', settings.custom_palette.trim());
  }
  if (settings.background.trim()) {
    form.append('background', settings.background.trim());
  }

  return request<TransformResult>('/api/transform', { method: 'POST', body: form, signal });
}

/** `POST /api/pattern` - turn a pixel grid into a cross stitch chart. */
export function buildPattern(
  grid: number[][],
  palette: PaletteColor[],
  symbols: string[],
  options: PatternOptions,
  signal?: AbortSignal,
): Promise<PatternResult> {
  return request<PatternResult>('/api/pattern', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: options.title,
      grid,
      palette: palette.map(({ hex, count, label }) => ({ hex, count, label })),
      symbols,
      repeatX: options.repeatX,
      repeatY: options.repeatY,
    }),
    signal,
  });
}
