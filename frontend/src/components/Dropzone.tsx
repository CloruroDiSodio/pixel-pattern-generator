'use client';

import { useCallback, useRef, useState } from 'react';

import { formatBytes } from '@/lib/download';
import { ACCEPTED_TYPES, MAX_FILE_BYTES } from '@/hooks/useImageUpload';
import type { UploadedImage } from '@/types';

interface DropzoneProps {
  image: UploadedImage | null;
  error: string | null;
  onFile: (file: File | null | undefined) => void | Promise<void>;
  onClear: () => void;
}

/**
 * Drag & drop / click / paste upload target with a thumbnail of the current
 * selection.  The whole thing is keyboard accessible via the hidden input.
 */
export default function Dropzone({ image, error, onFile, onClear }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      void onFile(event.dataTransfer.files?.[0]);
    },
    [onFile],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const item = Array.from(event.clipboardData.items).find((entry) =>
        entry.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        event.preventDefault();
        void onFile(file);
      }
    },
    [onFile],
  );

  return (
    <div className="space-y-3">
      {/*
        The visual frame is a plain <div>: it only handles drag/drop/paste.
        Previously it carried role="button" and wrapped a real <button>, which
        nests one interactive control inside another - invalid, and it made
        keyboard focus order confusing. The <label> below is the single
        accessible control.
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`flex min-h-[13rem] flex-col items-center justify-center gap-3 rounded-2xl
          border-2 border-dashed p-6 text-center transition
          ${dragging ? 'border-accent bg-accent/10' : 'border-ink-600 bg-ink-900/40'}`}
      >
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={`Selected source: ${image.name}`}
              className="max-h-32 rounded-lg border border-ink-600 object-contain"
            />
            <div className="text-sm text-slate-300">
              <span className="font-medium text-white">{image.name}</span>
              <span className="text-slate-400">
                {' '}
                · {image.width}×{image.height} · {formatBytes(image.size)}
              </span>
            </div>
            <label
              htmlFor="dropzone-file-input"
              className="btn btn-primary cursor-pointer"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              Replace image
            </label>
          </>
        ) : (
          <>
            <div aria-hidden="true" className="text-4xl">
              🖼️
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                Drop an image here, paste it, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-400">
                PNG, JPEG, GIF, WEBP, BMP or TIFF · up to {MAX_FILE_BYTES / (1024 * 1024)} MB
              </p>
            </div>
            <label
              htmlFor="dropzone-file-input"
              className="btn btn-primary cursor-pointer"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              Choose a file
            </label>
          </>
        )}

        <input
          ref={inputRef}
          id="dropzone-file-input"
          type="file"
          className="sr-only"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            // Allow re-selecting the same file.
            event.target.value = '';
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
          {error}
        </p>
      ) : null}

      {image ? (
        <button type="button" className="btn btn-ghost w-full" onClick={onClear}>
          Remove image
        </button>
      ) : null}
    </div>
  );
}
