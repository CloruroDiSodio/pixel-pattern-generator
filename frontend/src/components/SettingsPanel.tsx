'use client';

import { Select, Slider, Toggle } from '@/components/controls';
import type {
  DitherMode,
  PaletteDefinition,
  PaletteId,
  PaletteSort,
  QuantizeMethod,
  ResizeMode,
  TransformSettings,
  UploadedImage,
} from '@/types';

interface SettingsPanelProps {
  settings: TransformSettings;
  onChange: <K extends keyof TransformSettings>(key: K, value: TransformSettings[K]) => void;
  onReset: () => void;
  palettes: PaletteDefinition[];
  limits: { minGridSize: number; maxGridSize: number; maxColors: number };
  image: UploadedImage | null;
  estimatedHeight: number;
  disabled?: boolean;
}

const RESIZE_LABELS: Record<ResizeMode, string> = {
  pixelate: 'Pixelate (average blocks)',
  sample: 'Sample (keep hard edges)',
  smooth: 'Smooth (Lanczos)',
};

const QUANTIZE_LABELS: Record<QuantizeMethod, string> = {
  mediancut: 'Median cut (balanced)',
  maxcoverage: 'Max coverage (vivid)',
  fastoctree: 'Fast octree (quick)',
  libimagequant: 'libimagequant (best)',
};

const DITHER_LABELS: Record<DitherMode, string> = {
  none: 'None',
  floyd_steinberg: 'Floyd–Steinberg',
  bayer: 'Bayer (ordered)',
};

const SORT_LABELS: Record<PaletteSort, string> = {
  usage: 'Most used first',
  luminance: 'Dark to light',
  hex: 'Alphabetical',
};

const toOptions = <T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> =>
  (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));

/** All conversion knobs for the pixel pipeline. */
export default function SettingsPanel({
  settings,
  onChange,
  onReset,
  palettes,
  limits,
  image,
  estimatedHeight,
  disabled = false,
}: SettingsPanelProps) {
  const paletteOptions = [
    ...palettes.map((palette) => ({ value: palette.id as PaletteId, label: palette.name })),
    { value: 'custom' as PaletteId, label: 'Custom…' },
  ];

  return (
    <section className="panel space-y-5 p-5" aria-label="Conversion settings">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Settings</h2>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onReset} disabled={disabled}>
          Reset
        </button>
      </header>

      <Slider
        label="Grid width"
        value={settings.grid_width}
        min={limits.minGridSize}
        max={limits.maxGridSize}
        disabled={disabled}
        hint={
          image
            ? `≈ ${settings.grid_width} × ${estimatedHeight} stitches`
            : `${limits.minGridSize}–${limits.maxGridSize} columns`
        }
        onChange={(value) => onChange('grid_width', value)}
      />

      <Slider
        label="Colours"
        value={settings.max_colors}
        min={2}
        max={limits.maxColors}
        disabled={disabled}
        hint="Cap on the palette size"
        onChange={(value) => onChange('max_colors', value)}
      />

      <Select<ResizeMode>
        label="Resampling"
        value={settings.resize_mode}
        options={toOptions(RESIZE_LABELS)}
        disabled={disabled}
        onChange={(value) => onChange('resize_mode', value)}
      />

      <Select<QuantizeMethod>
        label="Quantization"
        value={settings.quantize_method}
        options={toOptions(QUANTIZE_LABELS)}
        disabled={disabled}
        onChange={(value) => onChange('quantize_method', value)}
      />

      <Select<DitherMode>
        label="Dithering"
        value={settings.dither}
        options={toOptions(DITHER_LABELS)}
        hint="Error diffusion reveals extra shades"
        disabled={disabled}
        onChange={(value) => onChange('dither', value)}
      />

      <Select<PaletteId>
        label="Palette"
        value={settings.palette}
        options={paletteOptions}
        hint={palettes.find((palette) => palette.id === settings.palette)?.description}
        disabled={disabled}
        onChange={(value) => onChange('palette', value)}
      />

      {settings.palette === 'custom' ? (
        <div className="animate-fade-in">
          <label className="field-label" htmlFor="custom-palette">
            Custom colours
          </label>
          <input
            id="custom-palette"
            className="text-input font-mono text-xs"
            placeholder="#1D2B53, #7E2553, #008751, #FFF1E8"
            value={settings.custom_palette}
            disabled={disabled}
            onChange={(event) => onChange('custom_palette', event.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Comma separated hex colours, up to {limits.maxColors}.
          </p>
        </div>
      ) : null}

      <Select<PaletteSort>
        label="Palette order"
        value={settings.palette_sort}
        options={toOptions(SORT_LABELS)}
        disabled={disabled}
        onChange={(value) => onChange('palette_sort', value)}
      />

      <div>
        <label className="field-label" htmlFor="background-colour">
          Transparent background
        </label>
        <div className="flex items-center gap-2">
          <input
            id="background-colour"
            type="color"
            value={settings.background || '#ffffff'}
            disabled={disabled}
            onChange={(event) => onChange('background', event.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost flex-1"
            disabled={disabled || !settings.background}
            onClick={() => onChange('background', '')}
          >
            {settings.background ? 'Use white' : 'Using white'}
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t border-ink-700 pt-4">
        <Slider
          label="Preview size"
          value={settings.preview_scale}
          min={1}
          max={40}
          suffix="×"
          hint="Pixels per cell in the exported PNG"
          disabled={disabled}
          onChange={(value) => onChange('preview_scale', value)}
        />
        <Toggle
          label="Grid lines"
          checked={settings.grid_lines}
          disabled={disabled}
          onChange={(value) => onChange('grid_lines', value)}
        />
      </div>

    </section>
  );
}
