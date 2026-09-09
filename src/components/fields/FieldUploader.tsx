'use client';

import * as React from 'react';
import { AlertCircle, FileText, Paperclip, Upload } from 'lucide-react';
import { prepareUpload, registerMedia } from '@/lib/actions/media';
import { uploadToStorage } from '@/lib/upload';
import { cn } from '@/lib/utils';

/** One library file already answering this field, enough to show a thumbnail. */
export interface FieldAttachment {
  id: string;
  fileName: string;
  mimeType: string | null;
  url: string | null;
}

/** How many thumbnails fit before the row starts looking like a gallery. */
const PREVIEW_LIMIT = 4;

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
  files = [],
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
  /** Those files, so what was uploaded is visible without opening the library. */
  files?: FieldAttachment[];
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

  async function send(chosen: File[]) {
    setError(null);
    for (const file of chosen) {
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

      {/*
        What was actually uploaded here, shown where it was uploaded. Without
        this the only way to find out what a field holds is to open the library
        and work it out from filenames.
      */}
      {files.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {files.slice(0, PREVIEW_LIMIT).map((f) => {
            const isImage = (f.mimeType ?? '').startsWith('image/');
            const href = libraryHref ? `${libraryHref}&file=${f.id}` : undefined;
            const body = (
              <>
                <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-edge bg-sunken">
                  {isImage && f.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed
                    // storage URL; the loader would need a per-project host
                    <img
                      src={f.url}
                      alt={f.fileName}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                  )}
                </span>
                <span className="sr-only">{f.fileName}</span>
              </>
            );

            return (
              <li key={f.id}>
                {href ? (
                  <a
                    href={href}
                    title={f.fileName}
                    className="block rounded transition-opacity duration-150 hover:opacity-80"
                  >
                    {body}
                  </a>
                ) : (
                  <span title={f.fileName}>{body}</span>
                )}
              </li>
            );
          })}

          {files.length > PREVIEW_LIMIT ? (
            <li>
              <a
                href={libraryHref}
                className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-edge-strong bg-sunken text-2xs font-medium text-ink-secondary hover:text-ink"
              >
                +{files.length - PREVIEW_LIMIT}
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}

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
