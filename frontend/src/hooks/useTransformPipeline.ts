'use client';

import { useCallback, useEffect, useState } from 'react';

import { transformImage } from '@/lib/api';
import { useI18n } from '@/components/I18nProvider';
import type { TransformResult, TransformSettings, UploadedImage } from '@/types';

import { useDebouncedValue } from './useDebouncedValue';

export type PipelineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseTransformPipeline {
  transform: TransformResult | null;
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
 * Drive `POST /api/transform`: the expensive call that turns the uploaded file
 * into a pixel grid.
 *
 * The companion `/api/pattern` call lives in `usePatternSync`.  It used to live
 * here too, but the editor needs the grid *before* the transform hook can be
 * given anything - it is built from the very result that hook produces.  Splitting
 * them removes that cycle; the two hooks are still wired together by the page.
 *
 * The request is debounced and abortable, so dragging a slider never queues up a
 * backlog of requests and a slow response can never overwrite a newer one.
 */
export function useTransformPipeline(
  image: UploadedImage | null,
  settings: TransformSettings,
  enabled = true,
): UseTransformPipeline {
  const [transform, setTransform] = useState<TransformResult | null>(null);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const { t, localizeError } = useI18n();

  const debouncedSettings = useDebouncedValue(settings, 350);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  // Reset everything when the source image changes.
  useEffect(() => {
    setTransform(null);
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
        setError(localizeError(cause) || t('status.unexpected'));
      });

    return () => controller.abort();
  }, [image, debouncedSettings, enabled, nonce, localizeError, t]);

  return {
    transform,
    status,
    error,
    isRefreshing: status === 'loading' && transform !== null,
    reload,
  };
}
