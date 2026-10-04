'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n, useTranslate } from '@/components/I18nProvider';
import CraftPattern from '@/components/CraftPattern';
import DownloadMenu from '@/components/DownloadMenu';
import Dropzone from '@/components/Dropzone';
import Header from '@/components/Header';
import PaletteStrip from '@/components/PaletteStrip';
import PixelCanvas from '@/components/PixelCanvas';
import PixelEditor from '@/components/PixelEditor';
import SettingsPanel from '@/components/SettingsPanel';
import StatusBanner from '@/components/StatusBanner';
import { Select } from '@/components/controls';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { usePatternSync } from '@/hooks/usePatternSync';
import type { GridOverride } from '@/hooks/usePatternSync';
import { usePixelEdit } from '@/hooks/usePixelEdit';
import { useTransformPipeline } from '@/hooks/useTransformPipeline';
import { API_BASE_URL, fetchApiOptions, fetchHealth, fetchPalettes } from '@/lib/api';
import { recountPalette } from '@/lib/pixelEdit';
import { DEFAULT_SETTINGS, DEFAULT_THREAD_BRAND, FALLBACK_LIMITS } from '@/lib/settings';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/zoom';
import { APP_VERSION } from '@/lib/version';
import type {
  ApiOptions,
  PaletteColor,
  PalettesResponse,
  PatternOptions,
  PatternResult,
  ThreadBrandInfo,
  TransformResult,
  TransformSettings,
  ViewMode,
} from '@/types';

/**
 * Stable empty list used until `/api/options` answers.
 *
 * A module-level constant, not a literal: `usePixelEdit` builds its callbacks
 * from this value, and a fresh `[]` on every render would give them a new
 * identity each time and defeat the `memo` on `PixelCanvas`.
 */
const EMPTY_SYMBOL_POOL: string[] = [];

/**
 * Stable empty list used until `/api/options` answers.
 *
 * Same reasoning as {@link EMPTY_SYMBOL_POOL}: a fresh `[]` per render would give
 * the pattern view a new prop identity on every unrelated state change.
 */
const EMPTY_THREAD_BRANDS: ThreadBrandInfo[] = [];

export default function StudioPage() {
  const { image, error: uploadError, acceptFile, clear } = useImageUpload();
  const [settings, setSettings] = useLocalStorage<TransformSettings>('ppg.settings', DEFAULT_SETTINGS);
  const [patternOptions, setPatternOptions] = useState<PatternOptions>({
    title: 'My pattern',
    repeatX: 1,
    repeatY: 1,
    threadBrand: DEFAULT_THREAD_BRAND,
  });
  const [view, setView] = useState<ViewMode>('pixels');
  const [zoom, setZoom] = useState(12);
  /** Largest zoom at which the grid still fits; reported by `PixelCanvas`. */
  const [fitZoomValue, setFitZoomValue] = useState(MIN_ZOOM);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [palettes, setPalettes] = useState<PalettesResponse['palettes']>([]);
  const [options, setOptions] = useState<ApiOptions | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { t } = useI18n();

  const {
    transform,
    status,
    error: transformError,
    isRefreshing,
    reload,
  } = useTransformPipeline(image, settings, backendOnline !== false);

  const symbolPool = options?.symbols ?? EMPTY_SYMBOL_POOL;

  const editor = usePixelEdit({
    transform,
    background: settings.background,
    symbolPool,
  });

  /**
   * The grid the editor wants `/api/pattern` to build from, or `null` while the
   * canvas is pristine.  `useMemo` keeps the identity stable between edits so
   * the pattern sync does not re-fire on every unrelated re-render.
   */
  const gridOverride = useMemo<GridOverride | null>(
    () =>
      transform && editor.grid
        ? { grid: editor.grid, palette: editor.palette, symbols: editor.symbols }
        : null,
    [editor.grid, editor.palette, editor.symbols, transform],
  );

  const { pattern, error: patternError } = usePatternSync(
    transform,
    patternOptions,
    gridOverride,
    backendOnline !== false,
  );

  /**
   * What the UI actually renders and exports.
   *
   * Deliberately the *same object* as `transform` when nothing has been edited,
   * so the untouched studio keeps the exact memo behaviour it had before the
   * editor existed.  Once there are edits the grid is ours, and the palette
   * counts are recomputed - the backend derived them before the user touched
   * anything, so the percentages on the swatches would otherwise stop adding up.
   */
  const result = useMemo<TransformResult | null>(() => {
    if (!transform) return null;
    if (!editor.grid) return transform;
    return { ...transform, grid: editor.grid, palette: recountPalette(editor.grid, editor.palette) };
  }, [editor.grid, editor.palette, transform]);

  const error = transformError ?? patternError;

  /* --- backend metadata (palettes, limits, health) ----------------------- */

  useEffect(() => {
    const controller = new AbortController();
    void fetchApiOptions(controller.signal).then(setOptions).catch(() => setOptions(null));
    void fetchPalettes(controller.signal)
      .then((response) => setPalettes(response.palettes))
      .catch(() => setPalettes([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const online = await fetchHealth();
      if (!cancelled) setBackendOnline(online);
    };
    void probe();
    const timer = window.setInterval(() => void probe(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* --- derived values ---------------------------------------------------- */

  const limits = options?.limits ?? FALLBACK_LIMITS;
  const threadBrands = options?.threadBrands ?? EMPTY_THREAD_BRANDS;

  const estimatedHeight = useMemo(() => {
    if (!image || image.width === 0) return 0;
    return Math.max(1, Math.round((image.height / image.width) * settings.grid_width));
  }, [image, settings.grid_width]);

  const updateSetting = useCallback(
    <K extends keyof TransformSettings>(key: K, value: TransformSettings[K]) => {
      setSettings({ ...settings, [key]: value });
    },
    [settings, setSettings],
  );

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(t('toast.copied', { value }));
    } catch {
      setToast(t('toast.clipboardUnavailable'));
    }
  }, [t]);

  /* Stable callbacks: an inline arrow here would defeat PixelCanvas's memo. */
  const pickColor = useCallback(
    (color: PaletteColor) => void copyToClipboard(color.hex),
    [copyToClipboard],
  );

  /** Copying a hex value from the palette strip's detail line. */
  const copyPaletteColor = useCallback(
    (color: PaletteColor) => void copyToClipboard(color.hex),
    [copyToClipboard],
  );

  const { setActiveIndex } = editor;

  /**
   * Arming a swatch for painting.  `PaletteStrip` hands back the colour as well
   * as its index, but the grid stores the index, so the adapter is not optional.
   */
  const selectPaletteColor = useCallback(
    (_color: PaletteColor, index: number) => setActiveIndex(index),
    [setActiveIndex],
  );

  const reportFitZoom = useCallback((value: number) => {
    setFitZoomValue((previous) => (previous === value ? previous : value));
  }, []);

  /*
   * Re-processing the image (a settings change or "Re-run") rebuilds the grid
   * from the source file, so manual edits cannot survive it.  Silently dropping
   * somebody's work is exactly the kind of thing this project complains about
   * elsewhere, so say so.
   *
   * The ref has to be written from an effect rather than read during render: on
   * the render where the transform changes, `editor.isDirty` has *already*
   * flipped back to false, so reading it there would always miss.
   */
  const wasDirty = useRef(false);
  const lastTransform = useRef(transform);
  useEffect(() => {
    if (editor.isDirty) wasDirty.current = true;
  }, [editor.isDirty]);
  useEffect(() => {
    if (lastTransform.current === transform) return;
    lastTransform.current = transform;
    if (!wasDirty.current) return;
    wasDirty.current = false;
    setToast(t('editor.editsDiscarded'));
  }, [transform, t]);

  /**
   * "Re-run" is a destructive action once there are edits on the canvas, so it
   * asks first.  `window.confirm` blocks, which is fine for a rare deliberate
   * click and costs no dependency.
   */
  const rerun = useCallback(() => {
    if (editor.isDirty && !window.confirm(t('editor.discardConfirm'))) return;
    wasDirty.current = false;
    editor.discard();
    reload();
  }, [editor, reload, t]);

  const activeColor = useMemo(
    () => (editor.activeIndex === null ? null : (editor.palette[editor.activeIndex] ?? null)),
    [editor.activeIndex, editor.palette],
  );

  const totalCells = result ? result.width * result.height : 0;
  const busy = status === 'loading';

  return (
    <>
      <Header backendOnline={backendOnline} apiUrl={API_BASE_URL} />

      <main
        id="studio"
        tabIndex={-1}
        className="grid flex-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]"
      >
        {/* ---------------- Sidebar ---------------- */}
        <aside className="space-y-5">
          <section className="panel p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
              {t('sidebar.source')}
            </h2>
            <Dropzone image={image} error={uploadError} onFile={acceptFile} onClear={clear} />
          </section>

          <SettingsPanel
            settings={settings}
            onChange={updateSetting}
            onReset={() => setSettings(DEFAULT_SETTINGS)}
            palettes={palettes}
            limits={limits}
            image={image}
            estimatedHeight={estimatedHeight}
            disabled={!image}
          />
        </aside>

        {/* ---------------- Workspace ---------------- */}
        <section className="min-w-0 space-y-5">
          <StatusBanner error={error} loading={busy && !transform} />

          {!image ? (
            <div className="panel flex min-h-[24rem] flex-col items-center justify-center gap-2 p-10 text-center">
              <p className="text-lg font-medium text-white">{t('empty.title')}</p>
              <p className="max-w-md text-sm text-slate-400">{t('empty.body')}</p>
            </div>
          ) : (
            <>
              <div className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1 rounded-lg bg-ink-800 p-1">
                  {(['pixels', 'pattern'] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setView(mode)}
                      aria-pressed={view === mode}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                        view === mode ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === 'pixels' ? t('tab.pixels') : t('tab.pattern')}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {isRefreshing ? <span className="chip">{t('toolbar.updating')}</span> : null}
                  {transform ? (
                    <span className="chip">{t('toolbar.serverMs', { ms: transform.processingMs })}</span>
                  ) : null}
                  <button type="button" className="btn btn-ghost px-2 py-1" onClick={rerun}>
                    {t('toolbar.rerun')}
                  </button>
                </div>
              </div>

              {view === 'pixels' ? (
                <div className="space-y-5">
                  {result ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                          {t('canvas.zoom')}
                          <input
                            type="range"
                            min={MIN_ZOOM}
                            max={MAX_ZOOM}
                            value={zoom}
                            onChange={(event) => setZoom(Number(event.target.value))}
                            className="w-32"
                            aria-label="Preview zoom"
                          />
                          <span className="font-mono text-slate-300">{zoom}×</span>
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost px-2 py-1"
                          onClick={() => setZoom(fitZoomValue)}
                          disabled={zoom <= fitZoomValue}
                          title={t('canvas.fitTitle')}
                        >
                          {t('canvas.fit')}
                        </button>
                      </div>

                      <PixelEditor
                        tool={editor.tool}
                        onToolChange={editor.setTool}
                        activeColor={activeColor}
                        activeIndex={editor.activeIndex}
                        canUndo={editor.canUndo}
                        canRedo={editor.canRedo}
                        isDirty={editor.isDirty}
                        onUndo={editor.undo}
                        onRedo={editor.redo}
                      />

                      <PixelCanvas
                        grid={result.grid}
                        palette={result.palette}
                        zoom={zoom}
                        showGridLines={settings.grid_lines}
                        tool={editor.tool}
                        onPick={pickColor}
                        onEditCell={editor.apply}
                        onFitZoomChange={reportFitZoom}
                      />

                      <div className="panel space-y-4 p-5">
                        <PaletteStrip
                          palette={result.palette}
                          symbols={result.symbols}
                          totalCells={totalCells}
                          activeIndex={editor.activeIndex}
                          onSelect={selectPaletteColor}
                          onCopy={copyPaletteColor}
                        />
                        <DownloadMenu
                          transform={result}
                          pattern={pattern}
                          title={patternOptions.title}
                          disabled={busy}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <PatternView
                  patternOptions={patternOptions}
                  setPatternOptions={setPatternOptions}
                  threadBrands={threadBrands}
                  pattern={pattern}
                  transform={result}
                  busy={busy}
                />
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mt-10 flex flex-col gap-2 border-t border-ink-800 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {t('footer.lead')}{' '}
          <code className="font-mono text-slate-400">{API_BASE_URL}</code>
        </p>
        <p className="font-mono text-slate-500">{t('header.version', { version: APP_VERSION })}</p>
      </footer>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-slate-200 shadow-panel"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}

interface PatternViewProps {
  patternOptions: PatternOptions;
  setPatternOptions: (options: PatternOptions) => void;
  /** Thread brands advertised by `/api/options`. */
  threadBrands: ThreadBrandInfo[];
  pattern: PatternResult | null;
  /** The grid being charted - edited or not. */
  transform: TransformResult | null;
  busy: boolean;
}

/** The "craft pattern" tab: metadata form, chart and exports. */
function PatternView({
  patternOptions,
  setPatternOptions,
  threadBrands,
  pattern,
  transform,
  busy,
}: PatternViewProps) {
  const t = useTranslate();
  const { intlLocale } = useI18n();

  /**
   * "No brand" is a real choice, not the absence of one, so it is always offered
   * - even when the backend lists no tables. It is also the only entry that
   * needs translating; the brand names are proper nouns from the API.
   */
  const brandOptions = useMemo(
    () => [
      { value: DEFAULT_THREAD_BRAND, label: t('thread.none') },
      ...threadBrands.map((brand) => ({ value: brand.id, label: brand.name })),
    ],
    [threadBrands, t],
  );

  const activeBrand = threadBrands.find((brand) => brand.id === patternOptions.threadBrand);

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {t('pattern.details')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="field-label" htmlFor="pattern-title">
              {t('pattern.title')}
            </label>
            <input
              id="pattern-title"
              className="text-input"
              value={patternOptions.title}
              maxLength={120}
              onChange={(event) => setPatternOptions({ ...patternOptions, title: event.target.value })}
            />
          </div>
          <div className="sm:col-span-3">
            <Select
              label={t('thread.brand')}
              value={patternOptions.threadBrand}
              options={brandOptions}
              hint={t(activeBrand ? 'thread.brandHint' : 'thread.noneHint', {
                name: activeBrand?.name ?? '',
                colors: activeBrand?.colors ?? 0,
              })}
              onChange={(value) => setPatternOptions({ ...patternOptions, threadBrand: value })}
            />
          </div>
          <RepeatInput
            id="repeat-x"
            label={t('pattern.repeatX')}
            value={patternOptions.repeatX}
            onChange={(repeatX) => setPatternOptions({ ...patternOptions, repeatX })}
          />
          <RepeatInput
            id="repeat-y"
            label={t('pattern.repeatY')}
            value={patternOptions.repeatY}
            onChange={(repeatY) => setPatternOptions({ ...patternOptions, repeatY })}
          />
          <p className="self-end text-xs text-slate-400">
            {pattern
              ? t('pattern.stitchesTotal', {
                  count: pattern.totalStitches.toLocaleString(intlLocale),
                })
              : t('pattern.repeatsNote')}
          </p>
        </div>
      </section>

      <CraftPattern pattern={pattern} loading={busy} />

      <div className="panel p-5">
        <DownloadMenu transform={transform} pattern={pattern} title={patternOptions.title} disabled={busy} />
      </div>
    </div>
  );
}

interface RepeatInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function RepeatInput({ id, label, value, onChange }: RepeatInputProps) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        max={20}
        className="text-input"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) onChange(Math.min(20, Math.max(1, next)));
        }}
      />
    </div>
  );
}


