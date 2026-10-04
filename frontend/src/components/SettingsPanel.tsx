'use client';

import { Select, Slider, Toggle } from '@/components/controls';
import { useTranslate } from '@/components/I18nProvider';
import type { TranslationKey, Translate } from '@/lib/i18n';
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

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

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

/** Option labels, resolved lazily so they follow the active locale. */
const RESIZE_LABELS: Record<ResizeMode, TranslationKey> = {
  pixelate: 'resize.pixelate',
  sample: 'resize.sample',
  smooth: 'resize.smooth',
};

const QUANTIZE_LABELS: Record<QuantizeMethod, TranslationKey> = {
  mediancut: 'quantize.mediancut',
  maxcoverage: 'quantize.maxcoverage',
  fastoctree: 'quantize.fastoctree',
  libimagequant: 'quantize.libimagequant',
};

const DITHER_LABELS: Record<DitherMode, TranslationKey> = {
  none: 'dither.none',
  floyd_steinberg: 'dither.floyd_steinberg',
  bayer: 'dither.bayer',
};

const SORT_LABELS: Record<PaletteSort, TranslationKey> = {
  usage: 'sort.usage',
  luminance: 'sort.luminance',
  hex: 'sort.hex',
};

/** The `Set` is normalised away before comparison so no shared helper leaks in. */
const toOptions = <T extends string>(labels: Record<T, TranslationKey>, t: Translate): SelectOption<T>[] =>
  (Object.entries(labels) as Array<[T, TranslationKey]>).map(([value, key]) => ({
    value,
    label: t(key),
  }));

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
  const t = useTranslate();
  const paletteOptions = [
    ...palettes.map((palette) => ({ value: palette.id as PaletteId, label: palette.name })),
    { value: 'custom' as PaletteId, label: t('settings.paletteCustom') },
  ];

  return (
    <section className="panel space-y-5 p-5" aria-label="Conversion settings">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {t('sidebar.settings')}
        </h2>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onReset} disabled={disabled}>
          {t('sidebar.reset')}
        </button>
      </header>

      {/* Every control below is inert until an image exists. Saying so beats
          leaving the user to work out why dragging a slider does nothing. */}
      {disabled ? (
        <p className="rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-slate-400">
          {t('settings.disabledHint')}
        </p>
      ) : null}

      <Slider
        label={t('settings.gridWidth')}
        value={settings.grid_width}
        min={limits.minGridSize}
        max={limits.maxGridSize}
        disabled={disabled}
        hint={
          image
            ? t('settings.gridWidthHintImage', {
                width: settings.grid_width,
                height: estimatedHeight,
              })
            : t('settings.gridWidthHintRange', {
                min: limits.minGridSize,
                max: limits.maxGridSize,
              })
        }
        onChange={(value) => onChange('grid_width', value)}
      />

      <Slider
        label={t('settings.colours')}
        value={settings.max_colors}
        min={2}
        max={limits.maxColors}
        disabled={disabled}
        hint={t('settings.coloursHint')}
        onChange={(value) => onChange('max_colors', value)}
      />

      <Select<ResizeMode>
        label={t('settings.resampling')}
        value={settings.resize_mode}
        options={toOptions(RESIZE_LABELS, t)}
        disabled={disabled}
        onChange={(value) => onChange('resize_mode', value)}
      />

      <Select<QuantizeMethod>
        label={t('settings.quantization')}
        value={settings.quantize_method}
        options={toOptions(QUANTIZE_LABELS, t)}
        disabled={disabled}
        onChange={(value) => onChange('quantize_method', value)}
      />

      <Select<DitherMode>
        label={t('settings.dithering')}
        value={settings.dither}
        options={toOptions(DITHER_LABELS, t)}
        hint={t('settings.ditherHint')}
        disabled={disabled}
        onChange={(value) => onChange('dither', value)}
      />

      <Select<PaletteId>
        label={t('settings.palette')}
        value={settings.palette}
        options={paletteOptions}
        hint={palettes.find((palette) => palette.id === settings.palette)?.description}
        disabled={disabled}
        onChange={(value) => onChange('palette', value)}
      />

      {settings.palette === 'custom' ? (
        <div className="animate-fade-in">
          <label className="field-label" htmlFor="custom-palette">
            {t('settings.customColours')}
          </label>
          <input
            id="custom-palette"
            className="text-input font-mono text-xs"
            placeholder="#1D2B53, #7E2553, #008751, #FFF1E8"
            value={settings.custom_palette}
            disabled={disabled}
            onChange={(event) => onChange('custom_palette', event.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {t('settings.customColoursHint', { max: limits.maxColors })}
          </p>
        </div>
      ) : null}

      <Select<PaletteSort>
        label={t('settings.paletteOrder')}
        value={settings.palette_sort}
        options={toOptions(SORT_LABELS, t)}
        disabled={disabled}
        onChange={(value) => onChange('palette_sort', value)}
      />

      <div>
        <label className="field-label" htmlFor="background-colour">
          {t('settings.background')}
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
            {settings.background ? t('settings.useWhite') : t('settings.usingWhite')}
          </button>
        </div>
      </div>

      <div className="border-t border-ink-700 pt-4">
        <Toggle
          label={t('settings.gridLines')}
          checked={settings.grid_lines}
          disabled={disabled}
          onChange={(value) => onChange('grid_lines', value)}
        />
      </div>

    </section>
  );
}
