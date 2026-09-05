'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MessagesSquare,
  Mic,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  attachAudio,
  createInterview,
  deleteInterview,
  prepareAudioUpload,
  removeAudio,
  updateInterview,
} from '@/lib/actions/interviews';
import { uploadToStorage } from '@/lib/upload';
import { RichTextField } from '@/components/fields/RichTextField';
import { richTextToPlain } from '@/lib/rich-text';
import type { PersonOption } from '@/components/fields/DynamicField';
import { Badge, Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { OrgMember } from './CaseDetailsCard';

/**
 * Every interview on a case, not one.
 *
 * A case type's sections hold one answer per field, which is right for "what
 * colour was the smoke" and wrong for "who did you speak to" — there is no
 * fixed number of witnesses. So interviews are rows of their own, added as the
 * case turns them up.
 *
 * Transcription is not wired to a provider yet. Rather than show a button that
 * would do nothing, each interview says where it stands and the recording is
 * kept ready for the day the provider is chosen.
 */

export interface InterviewRow {
  id: string;
  subjectName: string;
  subjectPersonId: string | null;
  conductedBy: string | null;
  conductedById: string | null;
  interviewDate: string | null;
  location: string | null;
  narrative: string | null;
  audioPath: string | null;
  audioMime: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  transcriptStatus: string;
  transcriptError: string | null;
  aiSummary: string | null;
  createdAt: string;
}

const TRANSCRIPT_LABEL: Record<string, string> = {
  not_started: 'Not transcribed',
  pending: 'Queued for transcription',
  processing: 'Transcribing',
  complete: 'Transcribed',
  failed: 'Transcription failed',
};

function duration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A local <input type="date"> value from a stored timestamp. */
function dateValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

interface Draft {
  subjectName: string;
  subjectPersonId: string;
  conductedBy: string;
  conductedById: string;
  interviewDate: string;
  location: string;
  narrative: string;
}

const EMPTY: Draft = {
  subjectName: '',
  subjectPersonId: '',
  conductedBy: '',
  conductedById: '',
  interviewDate: '',
  location: '',
  narrative: '',
};

function draftOf(row: InterviewRow): Draft {
  return {
    subjectName: row.subjectName,
    subjectPersonId: row.subjectPersonId ?? '',
    conductedBy: row.conductedBy ?? '',
    conductedById: row.conductedById ?? '',
    interviewDate: dateValue(row.interviewDate),
    location: row.location ?? '',
    narrative: row.narrative ?? '',
  };
}

export function InterviewsPanel({
  caseId,
  interviews,
  people,
  members,
  canWrite,
}: {
  caseId: string;
  interviews: InterviewRow[];
  people: PersonOption[];
  members: OrgMember[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(interviews[0]?.id ?? null);
  const [adding, setAdding] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState<Draft>(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const withAudio = interviews.filter((i) => i.audioPath).length;

  async function add() {
    setBusy(true);
    setError(null);
    const result = await createInterview({ caseId, ...newDraft, subjectPersonId: newDraft.subjectPersonId || null, conductedById: newDraft.conductedById || null });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAdding(false);
    setNewDraft(EMPTY);
    setOpen(result.data.id);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Interviews and statements</h2>
          <p className="text-xs text-ink-muted">
            {interviews.length} on this case
            {withAudio > 0 ? ` · ${withAudio} with a recording` : ''}
          </p>
        </div>
        {canWrite && !adding ? (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add interview
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {adding ? (
        <section className="rounded-lg border border-accent bg-raised p-3">
          <h3 className="mb-3 text-sm font-semibold text-ink">New interview</h3>
          <DetailsForm
            draft={newDraft}
            people={people}
            members={members}
            disabled={busy}
            idPrefix="new"
            onChange={setNewDraft}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" loading={busy} onClick={() => void add()}>
              Add interview
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setNewDraft(EMPTY);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <p className="ml-auto text-2xs text-ink-muted">
              A recording can be attached once it exists.
            </p>
          </div>
        </section>
      ) : null}

      {interviews.length === 0 && !adding ? (
        <EmptyState
          icon={MessagesSquare}
          title="No interviews recorded yet"
          description={
            canWrite
              ? 'Add one per person you speak to. There is no limit, and each keeps its own account, recording and transcript.'
              : 'Nobody has been interviewed on this case yet.'
          }
        />
      ) : null}

      <ul className="space-y-2">
        {interviews.map((row) => (
          <InterviewCard
            key={row.id}
            caseId={caseId}
            row={row}
            people={people}
            members={members}
            canWrite={canWrite}
            expanded={open === row.id}
            onToggle={() => setOpen(open === row.id ? null : row.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function InterviewCard({
  caseId,
  row,
  people,
  members,
  canWrite,
  expanded,
  onToggle,
}: {
  caseId: string;
  row: InterviewRow;
  people: PersonOption[];
  members: OrgMember[];
  canWrite: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(row));
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [percent, setPercent] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Adopt fresh values from the server while this card is closed, never while
  // somebody is part-way through editing it.
  React.useEffect(() => {
    if (!expanded) setDraft(draftOf(row));
  }, [row, expanded]);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateInterview({
      id: row.id,
      caseId,
      ...draft,
      subjectPersonId: draft.subjectPersonId || null,
      conductedById: draft.conductedById || null,
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

  async function sendAudio(file: File) {
    setError(null);
    setPercent(0);

    const prep = await prepareAudioUpload({ caseId, fileName: file.name, size: file.size });
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

    // Read the length from the file itself rather than asking anyone to type it.
    const seconds = await new Promise<number | undefined>((resolve) => {
      const el = document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        resolve(Number.isFinite(el.duration) ? el.duration : undefined);
        URL.revokeObjectURL(el.src);
      };
      el.onerror = () => resolve(undefined);
      el.src = URL.createObjectURL(file);
    });

    const result = await attachAudio({
      id: row.id,
      caseId,
      storagePath: prep.data.path,
      mimeType: file.type,
      durationSeconds: seconds,
    });
    setPercent(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const status = TRANSCRIPT_LABEL[row.transcriptStatus] ?? row.transcriptStatus;
  const summary = richTextToPlain(row.narrative).slice(0, 110);

  return (
    <li className="overflow-hidden rounded-lg border border-edge bg-raised">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-sunken"
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-ink">{row.subjectName}</span>
            {row.audioPath ? (
              <Badge>
                <Mic className="mr-1 h-3 w-3" aria-hidden="true" />
                {duration(row.durationSeconds) || 'Recording'}
              </Badge>
            ) : null}
            <span className="text-2xs text-ink-muted">{status}</span>
          </span>
          <span className="mt-0.5 block text-xs text-ink-secondary">
            {[
              row.interviewDate ? new Date(row.interviewDate).toLocaleDateString() : null,
              row.conductedBy ? `by ${row.conductedBy}` : null,
              row.location,
            ]
              .filter(Boolean)
              .join(' · ') || 'No date or location recorded'}
          </span>
          {!expanded && summary ? (
            <span className="mt-0.5 block truncate text-xs text-ink-muted">{summary}</span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-edge px-3 py-3">
          {error ? (
            <p
              role="alert"
              className="mb-3 flex items-start gap-2 rounded border border-danger bg-danger-subtle px-2.5 py-2 text-xs text-danger"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <DetailsForm
            draft={draft}
            people={people}
            members={members}
            disabled={!canWrite || busy}
            idPrefix={row.id}
            onChange={setDraft}
          />

          {/* ---------- recording ---------- */}
          <div className="mt-3">
            <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">
              Recording
            </p>

            {row.audioUrl ? (
              <div className="space-y-1.5">
                <audio src={row.audioUrl} controls className="w-full" />
                <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-muted">
                  <span>
                    {row.audioMime ?? 'audio'}
                    {row.durationSeconds ? ` · ${duration(row.durationSeconds)}` : ''}
                  </span>
                  {canWrite ? (
                    <>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="cursor-pointer font-medium text-accent underline underline-offset-2"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBusy(true);
                          void removeAudio({ id: row.id, caseId }).then((r) => {
                            setBusy(false);
                            if (!r.ok) setError(r.error);
                            else router.refresh();
                          });
                        }}
                        className="cursor-pointer font-medium text-danger underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : canWrite ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void sendAudio(f);
                }}
                className="flex flex-wrap items-center gap-2 rounded border border-dashed border-edge-strong bg-sunken px-3 py-2.5 text-sm text-ink-muted"
              >
                <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>No recording attached.</span>
                <button
                  type="button"
                  disabled={percent !== null}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-edge-strong bg-raised px-2 py-1 text-xs font-medium text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-3 w-3" aria-hidden="true" />
                  {percent === null ? 'Upload audio' : `${percent}%`}
                </button>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No recording attached.</p>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void sendAudio(f);
              }}
            />

            {percent !== null ? (
              <div
                className="mt-1 h-1 overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-label="Uploading recording"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
            ) : null}
          </div>

          {/* ---------- transcript ---------- */}
          <div className="mt-3">
            <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">
              Transcript
            </p>
            {row.transcript ? (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-edge bg-sunken px-2.5 py-2 text-sm text-ink">
                {row.transcript}
              </div>
            ) : (
              <p className="rounded border border-dashed border-edge-strong bg-sunken px-3 py-2.5 text-sm text-ink-muted">
                {row.transcriptStatus === 'failed' && row.transcriptError
                  ? row.transcriptError
                  : 'Automatic transcription is not connected yet. Attach the recording now and it will be waiting when it is.'}
              </p>
            )}
          </div>

          {/* ---------- actions ---------- */}
          {canWrite ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" loading={busy} onClick={() => void save()}>
                Save interview
              </Button>
              {saved ? (
                <span role="status" className="text-xs text-[color:var(--success)]">
                  Saved
                </span>
              ) : null}

              {confirming ? (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-secondary">
                  Remove this interview and its recording?
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    onClick={() => {
                      setBusy(true);
                      void deleteInterview({ id: row.id, caseId }).then((r) => {
                        setBusy(false);
                        if (!r.ok) {
                          setError(r.error);
                          setConfirming(false);
                          return;
                        }
                        router.refresh();
                      });
                    }}
                  >
                    Remove
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function DetailsForm({
  draft,
  people,
  members,
  disabled,
  idPrefix,
  onChange,
}: {
  draft: Draft;
  people: PersonOption[];
  members: OrgMember[];
  disabled?: boolean;
  idPrefix: string;
  onChange: (next: Draft) => void;
}) {
  const set = (key: keyof Draft) => (value: string) => onChange({ ...draft, [key]: value });
  const id = (name: string) => `iv-${idPrefix}-${name}`;

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <Field
        className="sm:col-span-3"
        id={id('subject')}
        label="Who was interviewed"
        value={draft.subjectName}
        onChange={set('subjectName')}
        placeholder="Marguerite Okonkwo"
      />

      <div className="sm:col-span-3">
        <label htmlFor={id('person')} className="mb-1.5 block text-sm font-medium text-ink">
          Person on this case
          <span className="ml-1.5 font-normal text-ink-muted">optional</span>
        </label>
        <select
          id={id('person')}
          disabled={disabled}
          value={draft.subjectPersonId}
          onChange={(e) => set('subjectPersonId')(e.target.value)}
          className="h-9 w-full cursor-pointer rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink disabled:cursor-not-allowed disabled:bg-sunken"
        >
          <option value="">Not linked</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} ({p.role})
            </option>
          ))}
        </select>
      </div>

      <Field
        className="sm:col-span-2"
        id={id('date')}
        label="Date"
        type="date"
        value={draft.interviewDate}
        onChange={set('interviewDate')}
        disabled={disabled}
      />
      <Field
        className="sm:col-span-4"
        id={id('location')}
        label="Location"
        value={draft.location}
        onChange={set('location')}
        placeholder="Site office, 1420 Foundry Street"
        disabled={disabled}
      />

      <Field
        className="sm:col-span-3"
        id={id('by')}
        label="Conducted by"
        value={draft.conductedBy}
        onChange={set('conductedBy')}
        placeholder="Name as it should appear on the record"
        disabled={disabled}
      />

      <div className="sm:col-span-3">
        <label htmlFor={id('byid')} className="mb-1.5 block text-sm font-medium text-ink">
          Account that conducted it
          <span className="ml-1.5 font-normal text-ink-muted">optional</span>
        </label>
        <select
          id={id('byid')}
          disabled={disabled}
          value={draft.conductedById}
          onChange={(e) => set('conductedById')(e.target.value)}
          className="h-9 w-full cursor-pointer rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink disabled:cursor-not-allowed disabled:bg-sunken"
        >
          <option value="">Not linked</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-6">
        <label
          htmlFor={id('narrative')}
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Account
          <span className="ml-1.5 font-normal text-ink-muted">
            what was said, in your words or theirs
          </span>
        </label>
        <RichTextField
          id={id('narrative')}
          value={draft.narrative}
          disabled={disabled}
          placeholder="Arrived at the unit at about 21:40 and saw smoke from the loading bay."
          onCommit={(html) => set('narrative')(html)}
        />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted',
          'disabled:cursor-not-allowed disabled:bg-sunken',
        )}
      />
    </div>
  );
}
