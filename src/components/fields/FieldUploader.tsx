'use client';

import * as React from 'react';
import { AlertCircle, Paperclip, Upload } from 'lucide-react';
import { prepareUpload, registerMedia } from '@/lib/actions/media';
import { uploadToStorage } from '@/lib/upload';
import { cn } from '@/lib/utils';

/**
 * A photo or file field, attached to the case library rather than owning its
 * own storage.
 *
 * Files uploaded here carry the section and field they came from, which is the
 * difference that makes a storage-backed field answerable: before this, a
 * "Scene Photographs" field could never be filled, so a section holding one was
 * permanently one short of complete no matter how many photographs the case
 * actually had.
 *
 * They still land in the library and appear in the gallery alongside everything
 * else — this is a way in, not a separate cupboard.
 */
export function FieldUploader({
  caseId,
  sectionId,
  fieldId,
  label,
  kind,
  attached,
  disabled,
  libraryHref,
  onAttached,
}: {
  caseId: string;
  sectionId: string;
  fieldId: string;
  label: string;
  kind: 'photo' | 'file';
  /** How many library files already point at this field. */
  attached: number;
  disabled?: boolean;
  libraryHref?: string;
  onAttached?: () => void;
}) {
  const [percent, setPercent] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const inputId = `upload-${fieldId}`;
  const busy = percent !== null;

  async function send(files: File[]) {
    setError(null);
    for (const file of files) {
      setPercent(0);

      const prep = await prepareUpload({ caseId, fileName: file.name, size: file.size });
      if (!prep.ok) {
        setError(prep.error);
        setPercent(null);
        return;
      }

      try {
        await uploadToStorage({
          bucket: prep.data.bucket,
          path: prep.data.path,
          file,
          onProgress: setPercent,
        });
      } catch (e) {
        setError((e as Error).message);
        setPercent(null);
        return;
      }

      const reg = await registerMedia({
        caseId,
        fileName: file.name,
        storagePath: prep.data.path,
        mimeType: file.type,
        sizeBytes: file.size,
        capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
        sectionId,
        fieldId,
        caption: label,
      });

      if (!reg.ok) {
        setError(reg.error);
        setPercent(null);
        return;
      }

      onAttached?.();
    }
    setPercent(null);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          const list = [...e.dataTransfer.files];
          if (list.length) void send(list);
        }}
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded border border-dashed px-3 py-2.5 text-sm transition-colors duration-150',
          dragging ? 'border-accent bg-accent-subtle' : 'border-edge-strong bg-sunken',
        )}
      >
        <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />

        <span className={attached > 0 ? 'text-ink' : 'text-ink-muted'}>
          {attached === 0
            ? `No ${kind === 'photo' ? 'photographs' : 'files'} attached`
            : `${attached} ${kind === 'photo' ? 'photograph' : 'file'}${attached === 1 ? '' : 's'} attached`}
        </span>

        {!disabled ? (
          <>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              multiple
              accept={kind === 'photo' ? 'image/*' : undefined}
              className="sr-only"
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = '';
                if (list.length) void send(list);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-edge-strong bg-raised px-2 py-1 text-xs font-medium text-ink transition-colors duration-150 hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-3 w-3" aria-hidden="true" />
              {busy ? `${percent}%` : 'Upload'}
            </button>
          </>
        ) : null}

        {libraryHref ? (
          <a
            href={libraryHref}
            className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            View in library
          </a>
        ) : null}
      </div>

      {busy ? (
        <div
          className="mt-1 h-1 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-label={`Uploading to ${label}`}
          aria-valuenow={percent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
