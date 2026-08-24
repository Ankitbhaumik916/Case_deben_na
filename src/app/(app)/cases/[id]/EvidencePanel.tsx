'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Package,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  addCustodyEvent,
  createEvidence,
  deleteCustodyEvent,
  deleteEvidence,
} from '@/lib/actions/evidence';
import { Badge, Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface CustodyEvent {
  id: string;
  eventType: string;
  actorName: string;
  location: string | null;
  occurredAt: string;
  notes: string | null;
}

export interface EvidenceItem {
  id: string;
  itemNumber: string;
  category: string | null;
  description: string;
  collectedFrom: string | null;
  collectedBy: string | null;
  collectedAt: string | null;
  examRequested: string | null;
  currentStatus: string;
  currentLocation: string | null;
  events: CustodyEvent[];
}

const EVENT_TYPES = [
  ['collected', 'Collected'],
  ['transferred', 'Transferred'],
  ['released', 'Released'],
  ['received', 'Received'],
  ['returned', 'Returned'],
  ['destroyed', 'Destroyed'],
] as const;

/** Local datetime string for an <input type="datetime-local"> default. */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function EvidencePanel({
  caseId,
  caseNumber,
  items,
  canWrite,
}: {
  caseId: string;
  caseNumber: string;
  items: EvidenceItem[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(items[0]?.id ?? null);
  const [adding, setAdding] = React.useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Evidence and chain of custody</h2>
          <p className="text-xs text-ink-muted">
            {items.length} item{items.length === 1 ? '' : 's'} ·{' '}
            {items.reduce((n, i) => n + i.events.length, 0)} custody entries
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/cases/${caseId}/custody`}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded border border-edge-strong bg-raised px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-sunken"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Preview &amp; print
          </Link>
          {canWrite && !adding ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add item
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {adding ? (
        <AddItemForm
          pending={pending}
          suggestedNumber={String(items.length + 1).padStart(3, '0')}
          onCancel={() => setAdding(false)}
          onSubmit={(values) =>
            run(
              () => createEvidence({ caseId, ...values }),
              () => setAdding(false),
            )
          }
        />
      ) : null}

      {items.length === 0 && !adding ? (
        <EmptyState
          icon={Package}
          title="No evidence recorded"
          description="Every item entered here opens its own custody ledger, and each hand-off is a dated entry against it."
        />
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="overflow-hidden rounded-lg border border-edge bg-raised">
            <div className="flex items-start gap-2 p-3">
              <button
                type="button"
                onClick={() => setOpen(open === item.id ? null : item.id)}
                aria-expanded={open === item.id}
                className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
              >
                {open === item.id ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-mono text-sm font-semibold text-ink">
                      {item.itemNumber}
                    </span>
                    {item.category ? <Badge>{item.category}</Badge> : null}
                    <Badge tone="accent">{item.currentStatus.replace(/_/g, ' ')}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink">{item.description}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {item.currentLocation ? `Now at ${item.currentLocation}` : 'Location not recorded'}
                    {item.examRequested ? ` · ${item.examRequested}` : ''}
                    {` · ${item.events.length} entr${item.events.length === 1 ? 'y' : 'ies'}`}
                  </span>
                </span>
              </button>

              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete item ${item.itemNumber}?`)) {
                      run(() => deleteEvidence(item.id, caseId));
                    }
                  }}
                  disabled={pending}
                  aria-label={`Delete item ${item.itemNumber}`}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-ink-muted hover:bg-sunken hover:text-ink disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {open === item.id ? (
              <div className="border-t border-edge bg-sunken p-3">
                <h3 className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-muted">
                  Custody timeline
                </h3>

                {item.events.length === 0 ? (
                  <p className="mb-3 rounded border border-danger bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                    This item has no custody entries. That is a gap in the chain — record how it
                    was collected.
                  </p>
                ) : (
                  <ol className="mb-3 space-y-0">
                    {item.events.map((event, index) => (
                      <li key={event.id} className="flex gap-2.5">
                        <span className="flex flex-col items-center">
                          <span
                            aria-hidden="true"
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                          />
                          {index < item.events.length - 1 ? (
                            <span aria-hidden="true" className="w-px flex-1 bg-edge-strong" />
                          ) : null}
                        </span>

                        <div className="min-w-0 flex-1 pb-3">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium capitalize text-ink">
                              {event.eventType}
                            </span>
                            <span className="tabular font-mono text-2xs text-ink-muted">
                              {new Date(event.occurredAt).toLocaleString()}
                            </span>
                            {canWrite ? (
                              <button
                                type="button"
                                onClick={() => run(() => deleteCustodyEvent(event.id, caseId))}
                                disabled={pending}
                                className="cursor-pointer text-2xs text-ink-muted hover:text-danger disabled:opacity-40"
                              >
                                remove
                              </button>
                            ) : null}
                          </div>
                          <p className="text-xs text-ink-secondary">
                            {event.actorName}
                            {event.location ? ` · ${event.location}` : ''}
                          </p>
                          {event.notes ? (
                            <p className="mt-0.5 text-xs text-ink-muted">{event.notes}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {canWrite ? (
                  <AddEventForm
                    pending={pending}
                    onSubmit={(values) =>
                      run(() => addCustodyEvent({ evidenceId: item.id, caseId, ...values }))
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-muted">
        The status and location shown against an item come from its newest custody entry, not from
        a separate field — so the summary can never disagree with the timeline. Case {caseNumber}.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ forms --- */

function AddItemForm({
  pending,
  suggestedNumber,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  suggestedNumber: string;
  onSubmit: (v: {
    itemNumber: string;
    description: string;
    category?: string;
    collectedFrom?: string;
    collectedBy?: string;
    collectedAt?: string;
    examRequested?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = React.useState({
    itemNumber: suggestedNumber,
    description: '',
    category: '',
    collectedFrom: '',
    collectedBy: '',
    collectedAt: nowLocal(),
    examRequested: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="space-y-3 rounded-lg border border-edge bg-raised p-3 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Item number" value={form.itemNumber} onChange={set('itemNumber')} required mono />
        <Field label="Category" value={form.category} onChange={set('category')} placeholder="Physical" />
        <Field
          label="Collected from"
          value={form.collectedFrom}
          onChange={set('collectedFrom')}
          placeholder="North loading door"
          className="sm:col-span-2"
        />
      </div>

      <Field
        label="Description"
        value={form.description}
        onChange={set('description')}
        required
        placeholder="Padlock, brass, showing tool marks"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Collected by" value={form.collectedBy} onChange={set('collectedBy')} />
        <Field label="Collected at" type="datetime-local" value={form.collectedAt} onChange={set('collectedAt')} />
        <Field
          label="Examination requested"
          value={form.examRequested}
          onChange={set('examRequested')}
          placeholder="Tool mark comparison"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          Add item
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <p className="text-xs text-ink-muted">
          The collection is written as the first entry in this item&rsquo;s ledger.
        </p>
      </div>
    </form>
  );
}

function AddEventForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (v: {
    eventType: (typeof EVENT_TYPES)[number][0];
    actorName: string;
    location?: string;
    occurredAt: string;
    notes?: string;
  }) => void;
}) {
  const [eventType, setEventType] = React.useState<(typeof EVENT_TYPES)[number][0]>('transferred');
  const [actorName, setActorName] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [occurredAt, setOccurredAt] = React.useState(nowLocal());
  const [notes, setNotes] = React.useState('');

  return (
    <form
      className="rounded border border-dashed border-edge-strong bg-raised p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ eventType, actorName, location, occurredAt, notes });
        setActorName('');
        setLocation('');
        setNotes('');
      }}
    >
      <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-muted">
        Record a hand-off
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          <span className="mb-1 text-2xs text-ink-muted">What happened</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as (typeof EVENT_TYPES)[number][0])}
            className="h-8 rounded border border-edge-strong bg-raised px-1.5 text-sm text-ink"
          >
            {EVENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-36 flex-1 flex-col">
          <span className="mb-1 text-2xs text-ink-muted">Who handled it</span>
          <input
            required
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            placeholder="Regional Laboratory intake"
            className="h-8 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
          />
        </label>

        <label className="flex min-w-32 flex-1 flex-col">
          <span className="mb-1 text-2xs text-ink-muted">Where</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Evidence receiving"
            className="h-8 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
          />
        </label>

        <label className="flex flex-col">
          <span className="mb-1 text-2xs text-ink-muted">When</span>
          <input
            required
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="h-8 rounded border border-edge-strong bg-raised px-2 text-sm text-ink"
          />
        </label>

        <Button type="submit" size="sm" loading={pending}>
          Record
        </Button>
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes — seal number, condition, anything that matters later"
        className="mt-2 h-8 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
      />
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
  mono,
  className,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  className?: string;
}) {
  const id = React.useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className={cn(
          'h-9 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted',
          mono && 'tabular font-mono',
        )}
      />
    </div>
  );
}
