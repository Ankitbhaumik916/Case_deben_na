'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  ListOrdered,
  Music,
  Rows3,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createMediaLog,
  deleteMedia,
  deleteMediaLog,
  prepareUpload,
  registerMedia,
  saveAnnotations,
} from '@/lib/actions/media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { uploadToStorage } from '@/lib/upload';
import { ImageMarkup, MarkupOverlay, type Shape } from '@/components/media/ImageMarkup';
import { Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * The case library.
 *
 * Three views over one set of files, because the same photographs are wanted
 * three different ways: as pictures to look through, as a table to audit, and
 * as a numbered log to attach to a report. Nothing here is per-discipline —
 * a fire scene and a burglary hold files identically.
 *
 * Bytes go straight from the browser to Supabase Storage over XHR, which is the
 * only reason there is a real progress bar: a server action would have to
 * receive the whole file before it could report anything, and a 400MB video
 * through a serverless function is a timeout, not a feature.
 */

export interface MediaFile {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  tags: string[];
  capturedAt: string | null;
  uploadedAt: string;
  uploadedByName: string | null;
  storagePath: string;
  url: string | null;
  annotations: Shape[];
}

export interface MediaLog {
  id: string;
  title: string;
  mediaIds: string[];
  generatedAt: string;
  generatedByName: string | null;
}

type View = 'gallery' | 'table' | 'logs';

type Job = {
  key: string;
  name: string;
  size: number;
  percent: number;
  state: 'waiting' | 'sending' | 'done' | 'failed';
  error?: string;
};

const VIEWS: [View, string, typeof LayoutGrid][] = [
  ['gallery', 'Gallery', LayoutGrid],
  ['table', 'Table', Rows3],
  ['logs', 'Log reports', ListOrdered],
];

function kindOf(mime: string | null): 'image' | 'video' | 'audio' | 'other' {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

function KindIcon({ mime, className }: { mime: string | null; className?: string }) {
  const Glyph = { image: ImageIcon, video: Film, audio: Music, other: FileText }[kindOf(mime)];
  return <Glyph className={className} aria-hidden="true" />;
}

function bytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function LibraryPanel({
  caseId,
  caseNumber,
  files,
  logs,
  canWrite,
}: {
  caseId: string;
  caseNumber: string;
  files: MediaFile[];
  logs: MediaLog[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<View>('gallery');
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tag, setTag] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [logTitle, setLogTitle] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Tags are free text on each file; the filter offers only what is actually
  // in use, so it never suggests a tag that would return nothing.
  const allTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [files]);

  const shown = React.useMemo(
    () => (tag === null ? files : files.filter((f) => f.tags.includes(tag))),
    [files, tag],
  );

  const open = files.find((f) => f.id === openId) ?? null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(list: File[]) {
    setError(null);
    const queued: Job[] = list.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      size: f.size,
      percent: 0,
      state: 'waiting',
    }));
    setJobs((prev) => [...prev, ...queued]);

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setJobs((prev) =>
        prev.map((j) =>
          queued.some((q) => q.key === j.key)
            ? { ...j, state: 'failed', error: 'Your session has expired. Sign in again.' }
            : j,
        ),
      );
      return;
    }

    const patch = (key: string, change: Partial<Job>) =>
      setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...change } : j)));

    // One at a time. Several large files in parallel make the progress bars
    // meaningless and are no faster on a single connection.
    for (const [i, file] of list.entries()) {
      const job = queued[i];
      patch(job.key, { state: 'sending' });

      const prep = await prepareUpload({ caseId, fileName: file.name, size: file.size });
      if (!prep.ok) {
        patch(job.key, { state: 'failed', error: prep.error });
        continue;
      }

      try {
        await uploadToStorage({
          bucket: prep.data.bucket,
          path: prep.data.path,
          file,
          onProgress: (percent) => patch(job.key, { percent }),
        });
      } catch (e) {
        patch(job.key, { state: 'failed', error: (e as Error).message });
        continue;
      }

      const reg = await registerMedia({
        caseId,
        fileName: file.name,
        storagePath: prep.data.path,
        mimeType: file.type,
        sizeBytes: file.size,
        capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
      });

      if (!reg.ok) {
        patch(job.key, { state: 'failed', error: reg.error });
        continue;
      }

      patch(job.key, { state: 'done', percent: 100 });
    }

    router.refresh();
    // Leave failures on screen; clear the ones that worked.
    window.setTimeout(
      () => setJobs((prev) => prev.filter((j) => j.state === 'failed')),
      2500,
    );
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? 'That did not work.');
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const active = jobs.filter((j) => j.state === 'sending' || j.state === 'waiting').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Case library</h2>
          <p className="text-xs text-ink-muted">
            {files.length} file{files.length === 1 ? '' : 's'}
            {allTags.length > 0 ? ` · ${allTags.length} tags` : ''}
            {logs.length > 0 ? ` · ${logs.length} log report${logs.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Library view"
            className="flex rounded border border-edge-strong bg-raised p-0.5"
          >
            {VIEWS.map(([key, label, Glyph]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-sm transition-colors duration-150',
                  view === key
                    ? 'bg-chrome text-ink-inverse'
                    : 'text-ink-secondary hover:bg-sunken hover:text-ink',
                )}
              >
                <Glyph className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {canWrite ? (
            <Button onClick={() => inputRef.current?.click()} disabled={active > 0}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {active > 0 ? `Uploading ${active}` : 'Upload'}
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = '';
          if (list.length) void send(list);
        }}
      />

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="space-y-1.5 rounded-lg border border-edge bg-raised p-3">
          {jobs.map((j) => (
            <li key={j.key}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-ink">{j.name}</span>
                <span
                  className={cn(
                    'tabular shrink-0 font-mono',
                    j.state === 'failed' ? 'text-danger' : 'text-ink-muted',
                  )}
                >
                  {j.state === 'failed'
                    ? 'failed'
                    : j.state === 'done'
                      ? 'done'
                      : `${j.percent}%`}
                </span>
              </div>
              <div
                className="mt-1 h-1 overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-label={`Uploading ${j.name}`}
                aria-valuenow={j.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={cn(
                    'h-full transition-[width] duration-200',
                    j.state === 'failed' ? 'bg-danger' : 'bg-accent',
                  )}
                  style={{ width: `${j.state === 'failed' ? 100 : j.percent}%` }}
                />
              </div>
              {j.error ? <p className="mt-0.5 text-2xs text-danger">{j.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Drop target. Also the empty state, so there is one obvious way in. */}
      {canWrite ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const list = [...e.dataTransfer.files];
            if (list.length) void send(list);
          }}
          className={cn(
            'rounded-lg border border-dashed px-4 text-center transition-colors duration-150',
            files.length === 0 ? 'py-10' : 'py-4',
            dragging ? 'border-accent bg-accent-subtle' : 'border-edge-strong bg-sunken',
          )}
        >
          <p className="text-sm text-ink-secondary">
            Drop files here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              choose them
            </button>
            .
          </p>
          <p className="mt-0.5 text-2xs text-ink-muted">
            Photographs, video, audio and documents. Up to 500MB each.
          </p>
        </div>
      ) : null}

      {allTags.length > 0 && view !== 'logs' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Tags</span>
          <Chip active={tag === null} onClick={() => setTag(null)}>
            All {files.length}
          </Chip>
          {allTags.map(([t, n]) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t} {n}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Selection drives the log report, so it is offered wherever files are. */}
      {selected.size > 0 && view !== 'logs' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-subtle px-3 py-2">
          <span className="text-sm font-medium text-ink">
            {selected.size} file{selected.size === 1 ? '' : 's'} selected
          </span>
          <input
            value={logTitle}
            onChange={(e) => setLogTitle(e.target.value)}
            placeholder={`Photo log — ${caseNumber}`}
            className="h-8 min-w-56 flex-1 rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
          />
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              run(
                () =>
                  createMediaLog({
                    caseId,
                    title: logTitle.trim() || `Photo log — ${caseNumber}`,
                    mediaIds: [...selected],
                  }),
                () => {
                  setSelected(new Set());
                  setLogTitle('');
                  setView('logs');
                },
              )
            }
          >
            <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
            Create log report
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {view === 'gallery' ? (
        <Gallery
          files={shown}
          selected={selected}
          onToggle={toggle}
          onOpen={setOpenId}
          canWrite={canWrite}
        />
      ) : null}

      {view === 'table' ? (
        <FileTable
          files={shown}
          selected={selected}
          onToggle={toggle}
          onOpen={setOpenId}
          canWrite={canWrite}
        />
      ) : null}

      {view === 'logs' ? (
        <Logs
          caseId={caseId}
          logs={logs}
          files={files}
          canWrite={canWrite}
          onDelete={(id) => run(() => deleteMediaLog({ id, caseId }))}
          pending={pending}
        />
      ) : null}

      {open ? (
        <Detail
          key={open.id}
          caseId={caseId}
          file={open}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            setOpenId(null);
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(open.id);
              return next;
            });
          }}
          onDelete={deleteMedia}
        />
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150',
        active
          ? 'border-chrome bg-chrome text-ink-inverse'
          : 'border-edge-strong bg-raised text-ink-secondary hover:bg-sunken hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Gallery({
  files,
  selected,
  onToggle,
  onOpen,
  canWrite,
}: {
  files: MediaFile[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  canWrite: boolean;
}) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="Nothing in the library yet"
        description={
          canWrite
            ? 'Upload photographs, video or documents and they will appear here.'
            : 'No files have been added to this case.'
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((f) => (
        <li key={f.id} className="group relative">
          <button
            type="button"
            onClick={() => onOpen(f.id)}
            className="block w-full cursor-pointer overflow-hidden rounded-lg border border-edge bg-raised text-left transition-shadow duration-150 hover:shadow"
          >
            <div className="relative flex aspect-[4/3] items-center justify-center bg-sunken">
              {kindOf(f.mimeType) === 'image' && f.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed
                // storage URLs are short-lived and host-specific; the loader
                // would have to be told about a host that changes per project.
                <>
                  <img
                    src={f.url}
                    alt={f.caption ?? f.fileName}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <MarkupOverlay shapes={f.annotations} />
                </>
              ) : (
                <KindIcon mime={f.mimeType} className="h-8 w-8 text-ink-muted" />
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-medium text-ink">{f.caption || f.fileName}</p>
              <p className="tabular mt-0.5 font-mono text-2xs text-ink-muted">
                {bytes(f.sizeBytes)} · {f.uploadedAt.slice(0, 10)}
              </p>
              {f.tags.length > 0 ? (
                <p className="mt-1 truncate text-2xs text-ink-secondary">{f.tags.join(' · ')}</p>
              ) : null}
            </div>
          </button>

          <label
            className={cn(
              'absolute left-1.5 top-1.5 flex cursor-pointer items-center rounded bg-raised/90 p-1 shadow-sm transition-opacity duration-150',
              selected.has(f.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(f.id)}
              onChange={() => onToggle(f.id)}
              className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
            />
            <span className="sr-only">Include {f.fileName} in a log report</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function FileTable({
  files,
  selected,
  onToggle,
  onOpen,
  canWrite,
}: {
  files: MediaFile[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  canWrite: boolean;
}) {
  type Key = 'fileName' | 'mimeType' | 'sizeBytes' | 'uploadedAt' | 'capturedAt';
  const [sort, setSort] = React.useState<{ key: Key; desc: boolean }>({
    key: 'uploadedAt',
    desc: true,
  });

  const rows = React.useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -cmp : cmp;
    });
    return copy;
  }, [files, sort]);

  if (files.length === 0) {
    return <EmptyState icon={FileText} title="Nothing in the library yet" />;
  }

  const head = (key: Key, label: string, className = '') => (
    <th scope="col" className={cn('py-2 pr-3 text-left font-medium', className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
        aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
        className="cursor-pointer text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        {label}
        {sort.key === key ? <span aria-hidden="true">{sort.desc ? ' ↓' : ' ↑'}</span> : null}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-edge bg-raised">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Files in the case library</caption>
        <thead className="border-b border-edge bg-sunken text-xs">
          <tr>
            <th scope="col" className="w-8 py-2 pl-3">
              <span className="sr-only">Select</span>
            </th>
            {head('fileName', 'File', 'pl-1')}
            {head('mimeType', 'Type')}
            {head('sizeBytes', 'Size')}
            {head('capturedAt', 'Captured')}
            {head('uploadedAt', 'Uploaded')}
            <th scope="col" className="py-2 pr-3 text-left font-medium text-ink-muted">Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="border-b border-edge last:border-0 hover:bg-sunken">
              <td className="py-2 pl-3">
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => onToggle(f.id)}
                  aria-label={`Include ${f.fileName} in a log report`}
                  className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
                />
              </td>
              <td className="py-2 pl-1 pr-3">
                <button
                  type="button"
                  onClick={() => onOpen(f.id)}
                  className="flex cursor-pointer items-center gap-1.5 text-left text-ink hover:text-accent"
                >
                  <KindIcon mime={f.mimeType} className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  <span className="max-w-64 truncate">{f.caption || f.fileName}</span>
                </button>
              </td>
              <td className="py-2 pr-3 text-xs text-ink-secondary">
                {f.mimeType?.split('/')[1] ?? '—'}
              </td>
              <td className="tabular py-2 pr-3 font-mono text-xs text-ink-secondary">
                {bytes(f.sizeBytes)}
              </td>
              <td className="tabular py-2 pr-3 font-mono text-xs text-ink-secondary">
                {f.capturedAt ? f.capturedAt.slice(0, 10) : '—'}
              </td>
              <td className="tabular py-2 pr-3 font-mono text-xs text-ink-secondary">
                {f.uploadedAt.slice(0, 10)}
              </td>
              <td className="py-2 pr-3 text-xs text-ink-secondary">{f.tags.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!canWrite ? (
        <p className="border-t border-edge px-3 py-2 text-2xs text-ink-muted">
          Read-only — files can be opened and downloaded, not changed.
        </p>
      ) : null}
    </div>
  );
}

function Logs({
  caseId,
  logs,
  files,
  canWrite,
  onDelete,
  pending,
}: {
  caseId: string;
  logs: MediaLog[];
  files: MediaFile[];
  canWrite: boolean;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No log reports yet"
        description="Select files in the gallery or table, then create a log report. It numbers them, carries their captions and dates, and prints."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => {
        // A log holds ids, not copies. If a file is later deleted the log says
        // so rather than silently shrinking.
        const present = log.mediaIds.filter((id) => files.some((f) => f.id === id)).length;
        const missing = log.mediaIds.length - present;

        return (
          <li
            key={log.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-raised px-3 py-2.5"
          >
            <div className="min-w-48 flex-1">
              <Link
                href={`/cases/${caseId}/media-log/${log.id}`}
                className="text-sm font-medium text-ink hover:text-accent"
              >
                {log.title}
              </Link>
              <p className="text-2xs text-ink-muted">
                {log.mediaIds.length} file{log.mediaIds.length === 1 ? '' : 's'}
                {missing > 0 ? ` · ${missing} since deleted` : ''} · generated{' '}
                {new Date(log.generatedAt).toLocaleString()}
                {log.generatedByName ? ` by ${log.generatedByName}` : ''}
              </p>
            </div>
            {canWrite ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onDelete(log.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Detail({
  caseId,
  file,
  canWrite,
  onClose,
  onDeleted,
  onDelete,
}: {
  caseId: string;
  file: MediaFile;
  canWrite: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onDelete: (input: { id: string; caseId: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [caption, setCaption] = React.useState(file.caption ?? '');
  const [tags, setTags] = React.useState(file.tags.join(', '));
  const [captured, setCaptured] = React.useState(file.capturedAt?.slice(0, 10) ?? '');
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [marks, setMarks] = React.useState<Shape[]>(file.annotations);
  const [markState, setMarkState] = React.useState<'idle' | 'saving' | 'saved'>('idle');

  React.useEffect(() => {
    setMarks(file.annotations);
  }, [file.annotations]);

  // Each mark is a finished gesture rather than a keystroke, so it is saved as
  // it is made. Nothing here touches the file — only the shapes beside it.
  async function persistMarks(next: Shape[]) {
    setMarks(next);
    setMarkState('saving');
    setError(null);
    const result = await saveAnnotations({ id: file.id, caseId, annotations: next });
    if (!result.ok) {
      setMarks(file.annotations);
      setMarkState('idle');
      setError(result.error);
      return;
    }
    setMarkState('saved');
    window.setTimeout(() => setMarkState('idle'), 2000);
    router.refresh();
  }

  async function save() {
    setBusy(true);
    setError(null);
    const { updateMedia } = await import('@/lib/actions/media');
    const result = await updateMedia({
      id: file.id,
      caseId,
      caption,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      capturedAt: captured ? new Date(captured).toISOString() : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-edge bg-raised p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{file.fileName}</h3>
          <p className="tabular font-mono text-2xs text-ink-muted">
            {file.mimeType ?? 'unknown type'} · {bytes(file.sizeBytes)} · uploaded{' '}
            {new Date(file.uploadedAt).toLocaleString()}
            {file.uploadedByName ? ` by ${file.uploadedByName}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer rounded p-1 text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div
          className={cn(
            'flex items-center justify-center overflow-hidden rounded bg-sunken',
            kindOf(file.mimeType) === 'image' ? 'border-0' : 'max-h-96 border border-edge',
          )}
        >
          {file.url && kindOf(file.mimeType) === 'image' ? (
            <div className="w-full">
              <ImageMarkup
                src={file.url}
                alt={file.caption ?? file.fileName}
                shapes={marks}
                canEdit={canWrite}
                onChange={(next) => void persistMarks(next)}
              />
            </div>
          ) : file.url && kindOf(file.mimeType) === 'video' ? (
            <video src={file.url} controls className="max-h-96 w-full" />
          ) : file.url && kindOf(file.mimeType) === 'audio' ? (
            <audio src={file.url} controls className="w-full p-4" />
          ) : (
            <div className="p-10 text-center">
              <KindIcon mime={file.mimeType} className="mx-auto h-8 w-8 text-ink-muted" />
              <p className="mt-2 text-xs text-ink-muted">No preview for this type.</p>
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <Field label="Caption">
            <textarea
              rows={2}
              disabled={!canWrite || busy}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What this shows, and from where."
              className="w-full resize-y rounded border border-edge-strong bg-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-muted disabled:bg-sunken"
            />
          </Field>

          <Field label="Tags" hint="Comma separated — scene, exterior, seized">
            <input
              disabled={!canWrite || busy}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="h-9 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink disabled:bg-sunken"
            />
          </Field>

          <Field label="Captured" hint="Taken from the file when it was uploaded">
            <input
              type="date"
              disabled={!canWrite || busy}
              value={captured}
              onChange={(e) => setCaptured(e.target.value)}
              className="h-9 rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink disabled:bg-sunken"
            />
          </Field>

          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {canWrite ? (
              <Button size="sm" loading={busy} onClick={() => void save()}>
                Save
              </Button>
            ) : null}
            {saved ? (
              <span role="status" className="text-xs text-[color:var(--success)]">
                Saved
              </span>
            ) : null}
            {markState !== 'idle' ? (
              <span role="status" className="text-xs text-ink-muted">
                {markState === 'saving' ? 'Saving mark-up…' : 'Mark-up saved'}
              </span>
            ) : null}

            {file.url ? (
              <a
                href={file.url}
                download={file.fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink hover:bg-sunken"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download
              </a>
            ) : null}

            {canWrite ? (
              confirming ? (
                <span className="flex items-center gap-1.5 text-xs text-ink-secondary">
                  Delete permanently?
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    onClick={() => {
                      setBusy(true);
                      void onDelete({ id: file.id, caseId }).then((r) => {
                        setBusy(false);
                        if (!r.ok) {
                          setError(r.error ?? 'That did not work.');
                          setConfirming(false);
                          return;
                        }
                        onDeleted();
                        router.refresh();
                      });
                    }}
                  >
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
              )
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
        {hint ? <span className="ml-1.5 normal-case tracking-normal opacity-80">{hint}</span> : null}
      </p>
      {children}
    </div>
  );
}
