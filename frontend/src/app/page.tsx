'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import CraftPattern from '@/components/CraftPattern';
import DownloadMenu from '@/components/DownloadMenu';
import Dropzone from '@/components/Dropzone';
import Header from '@/components/Header';
import PaletteStrip from '@/components/PaletteStrip';
import PixelCanvas from '@/components/PixelCanvas';
import SettingsPanel from '@/components/SettingsPanel';
import StatusBanner from '@/components/StatusBanner';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTransformPipeline } from '@/hooks/useTransformPipeline';
import type { TransformPipeline } from '@/hooks/useTransformPipeline';
import { API_BASE_URL, fetchApiOptions, fetchHealth, fetchPalettes } from '@/lib/api';
import { DEFAULT_SETTINGS, FALLBACK_LIMITS } from '@/lib/settings';
import type { ApiOptions, PalettesResponse, PatternOptions, TransformSettings, ViewMode } from '@/types';

export default function StudioPage() {
  const { image, error: uploadError, acceptFile, clear } = useImageUpload();
  const [settings, setSettings] = useLocalStorage<TransformSettings>('ppg.settings', DEFAULT_SETTINGS);
  const [patternOptions, setPatternOptions] = useState<PatternOptions>({
    title: 'My pattern',
    repeatX: 1,
    repeatY: 1,
  });
  const [view, setView] = useState<ViewMode>('pixels');
  const [zoom, setZoom] = useState(12);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [palettes, setPalettes] = useState<PalettesResponse['palettes']>([]);
  const [options, setOptions] = useState<ApiOptions | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { transform, pattern, status, error, isRefreshing, reload } = useTransformPipeline(
    image,
    settings,
    patternOptions,
    backendOnline !== false,
  );

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
      setToast(`Copied ${value}`);
    } catch {
      setToast('Clipboard is not available in this browser.');
    }
  }, []);

  const totalCells = transform ? transform.width * transform.height : 0;
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
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">Source</h2>
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
              <p className="text-lg font-medium text-white">Drop an image to begin</p>
              <p className="max-w-md text-sm text-slate-400">
                Everything runs on your own machine and our FastAPI backend — the image is never stored.
              </p>
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
                      {mode === 'pixels' ? 'Pixel art' : 'Craft pattern'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {isRefreshing ? <span className="chip">Updating…</span> : null}
                  {transform ? <span className="chip">{transform.processingMs} ms on the server</span> : null}
                  <button type="button" className="btn btn-ghost px-2 py-1" onClick={reload}>
                    ↻ Re-run
                  </button>
                </div>
              </div>

              {view === 'pixels' ? (
                <div className="space-y-5">
                  {transform ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                          Zoom
                          <input
                            type="range"
                            min={4}
                            max={40}
                            value={zoom}
                            onChange={(event) => setZoom(Number(event.target.value))}
                            className="w-32"
                            aria-label="Preview zoom"
                          />
                          <span className="font-mono text-slate-300">{zoom}×</span>
                        </label>
                      </div>

                      <PixelCanvas
                        grid={transform.grid}
                        palette={transform.palette}
                        zoom={zoom}
                        showGridLines={settings.grid_lines}
                        onPick={(color) => void copyToClipboard(color.hex)}
                      />

                      <div className="panel space-y-4 p-5">
                        <PaletteStrip
                          palette={transform.palette}
                          symbols={transform.symbols}
                          totalCells={totalCells}
                          onSelect={(color) => void copyToClipboard(color.hex)}
                        />
                        <DownloadMenu
                          transform={transform}
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
                  pattern={pattern}
                  transform={transform}
                  busy={busy}
                />
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mt-10 border-t border-ink-800 pt-6 text-xs text-slate-400">
        Pixel art conversion runs server-side with Pillow · patterns are generated by the FastAPI API at{' '}
        <code className="font-mono text-slate-400">{API_BASE_URL}</code>
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
  pattern: TransformPipeline['pattern'];
  transform: TransformPipeline['transform'];
  busy: boolean;
}

/** The "craft pattern" tab: metadata form, chart and exports. */
function PatternView({
  patternOptions,
  setPatternOptions,
  pattern,
  transform,
  busy,
}: PatternViewProps) {
  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Pattern details</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="field-label" htmlFor="pattern-title">
              Title
            </label>
            <input
              id="pattern-title"
              className="text-input"
              value={patternOptions.title}
              maxLength={120}
              onChange={(event) => setPatternOptions({ ...patternOptions, title: event.target.value })}
            />
          </div>
          <RepeatInput
            id="repeat-x"
            label="Repeat across"
            value={patternOptions.repeatX}
            onChange={(repeatX) => setPatternOptions({ ...patternOptions, repeatX })}
          />
          <RepeatInput
            id="repeat-y"
            label="Repeat down"
            value={patternOptions.repeatY}
            onChange={(repeatY) => setPatternOptions({ ...patternOptions, repeatY })}
          />
          <p className="self-end text-xs text-slate-400">
            {pattern
              ? `${pattern.totalStitches.toLocaleString()} stitches in total`
              : 'Repeats multiply the stitch count.'}
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


