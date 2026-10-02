'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { UploadedImage } from '@/types';

export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
];

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

interface UseImageUpload {
  image: UploadedImage | null;
  error: string | null;
  /** Validate and load a `File` (drop, paste or picker). */
  acceptFile: (file: File | null | undefined) => Promise<void>;
  clear: () => void;
}

function describeFileError(file: File): string | null {
  const looksLikeImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(file.name);
  if (!looksLikeImage) {
    return `“${file.name}” is not an image. Use PNG, JPEG, GIF, WEBP, BMP or TIFF.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB - the limit is 15 MB.`;
  }
  if (file.size === 0) {
    return `“${file.name}” is empty.`;
  }
  return null;
}

/**
 * Manage the user-selected image: validation, intrinsic size and a revocable
 * object URL for the live preview.
 */
export function useImageUpload(): UseImageUpload {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const releaseUrl = useCallback(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }, []);

  // Revoke the object URL when the component unmounts.
  useEffect(() => releaseUrl, [releaseUrl]);

  const acceptFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      const fileError = describeFileError(file);
      if (fileError) {
        setError(fileError);
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const dimensions = await readDimensions(url);
        releaseUrl();
        objectUrl.current = url;
        setImage({
          file,
          url,
          width: dimensions.width,
          height: dimensions.height,
          name: file.name,
          size: file.size,
        });
        setError(null);
      } catch {
        URL.revokeObjectURL(url);
        setError(`“${file.name}” could not be decoded as an image.`);
      }
    },
    [releaseUrl],
  );

  const clear = useCallback(() => {
    releaseUrl();
    setImage(null);
    setError(null);
  }, [releaseUrl]);

  return { image, error, acceptFile, clear };
}

/** Probe the intrinsic dimensions of an object URL. */
function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => reject(new Error('decode failed'));
    probe.src = url;
  });
}
