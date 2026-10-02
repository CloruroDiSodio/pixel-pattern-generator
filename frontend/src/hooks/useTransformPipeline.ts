'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildPattern, transformImage } from '@/lib/api';
import type { PatternOptions, PatternResult, TransformResult, TransformSettings, UploadedImage } from '@/types';

import { useDebouncedValue } from './useDebouncedValue';

export type PipelineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseTransformPipeline {
  transform: TransformResult | null;
  pattern: PatternResult | null;
  status: PipelineStatus;
  error: string | null;
  /** True while a request is in flight but a previous result is still shown. */
  isRefreshing: boolean;
  reload: () => void;
}

/** Exported so the page can type its props without repeating the shape. */
export type TransformPipeline = UseTransformPipeline;

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Drive the two backend calls that power the studio:
 *
 * 1. `POST /api/transform` whenever the image or the pixel settings change.
 * 2. `POST /api/pattern` whenever the transform result or the pattern options
 *    change (title, repeats).
 *
 * Both are debounced and abortable, so dragging a slider never queues up a
 * backlog of requests and a slow response can never overwrite a newer one.
 */
export function useTransformPipeline(
  image: UploadedImage | null,
  settings: TransformSettings,
  patternOptions: PatternOptions,
  enabled = true,
): UseTransformPipeline {
  const [transform, setTransform] = useState<TransformResult | null>(null);
  const [pattern, setPattern] = useState<PatternResult | null>(null);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const debouncedSettings = useDebouncedValue(settings, 350);
  const debouncedPatternOptions = useDebouncedValue(patternOptions, 300);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  // Reset everything when the source image changes.
  useEffect(() => {
    setTransform(null);
    setPattern(null);
    setError(null);
    setStatus(image ? 'loading' : 'idle');
  }, [image]);

  useEffect(() => {
    if (!enabled || !image) return undefined;

    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    transformImage(image.file, debouncedSettings, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setTransform(result);
        setStatus('ready');
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbort(cause)) return;
        setStatus('error');
        setError(cause instanceof Error ? cause.message : 'Unexpected error while processing.');
      });

    return () => controller.abort();
  }, [image, debouncedSettings, enabled, nonce]);

  useEffect(() => {
    if (!enabled || !transform) return undefined;

    const controller = new AbortController();
    buildPattern(
      transform.grid,
      transform.palette,
      transform.symbols,
      debouncedPatternOptions,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setPattern(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbort(cause)) return;
        setPattern(null);
        setError(
          cause instanceof Error
            ? `Pattern generation failed: ${cause.message}`
            : 'Pattern generation failed.',
        );
      });

    return () => controller.abort();
  }, [transform, debouncedPatternOptions, enabled]);

  return {
    transform,
    pattern,
    status,
    error,
    isRefreshing: status === 'loading' && transform !== null,
    reload,
  };
}
