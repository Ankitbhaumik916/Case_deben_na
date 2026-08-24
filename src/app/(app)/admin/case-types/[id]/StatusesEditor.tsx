'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  createStatus,
  deleteStatus,
  moveStatus,
  updateStatus,
} from '@/lib/actions/case-type-config';
import { Badge, Button, EmptyState } from '@/components/ui';
import { ErrorNote, IconButton, STATUS_SWATCHES, useAction } from './EditorBits';

export interface StatusRow {
  id: string;
  key: string;
  label: string;
  color: string;
  isInitial: boolean;
  isTerminal: boolean;
  requiresReview: boolean;
  caseCount: number;
}

export function StatusesEditor({
  caseTypeId,
  statuses,
  inherited,
}: {
  caseTypeId: string;
  statuses: StatusRow[];
  inherited: StatusRow[];
}) {
  const { run, pending, error } = useAction();
  const [adding, setAdding] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [color, setColor] = React.useState(STATUS_SWATCHES[1]);
  const [isInitial, setIsInitial] = React.useState(false);
  const [requiresReview, setRequiresReview] = React.useState(false);
  const [isTerminal, setIsTerminal] = React.useState(false);

  const usingInherited = statuses.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Status pipeline</h2>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add status
          </Button>
        ) : null}
      </div>

      <ErrorNote message={error} />

      {usingInherited ? (
        <p className="rounded border border-edge bg-sunken px-3 py-2 text-sm text-ink-secondary">
          This case type has no statuses of its own, so it inherits the organisation-wide
          pipeline below. Adding one here starts a private pipeline for this discipline
          and the inherited set stops applying to it.
        </p>
      ) : null}

      {adding ? (
        <form
          className="rounded-lg border border-edge bg-raised p-3 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createStatus({
                  caseTypeId,
                  label,
                  color,
                  isInitial,
                  isTerminal,
                  requiresReview,
                }),
              () => {
                setLabel('');
                setAdding(false);
                setIsInitial(false);
                setIsTerminal(false);
                setRequiresReview(false);
              },
            );
          }}
        >
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-44 flex-1">
              <label htmlFor="st-label" className="mb-1.5 block text-sm font-medium text-ink">
                Status label
              </label>
              <input
                id="st-label"
                autoFocus
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Awaiting Lab"
                className="h-9 w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Colour</legend>
              <div className="flex h-9 items-center gap-1.5">
                {STATUS_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-6 w-6 cursor-pointer rounded-full transition-transform duration-150 ${
                      color === c ? 'scale-110 ring-2 ring-ink ring-offset-2' : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </fieldset>

            <Button type="submit" size="sm" loading={pending}>
              Add
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-4">
            <Toggle
              label="Where new cases start"
              checked={isInitial}
              onChange={setIsInitial}
              hint="Only one status can be the starting point."
            />
            <Toggle
              label="Needs a reviewer"
              checked={requiresReview}
              onChange={setRequiresReview}
              hint="Investigators cannot move a case into it."
            />
            <Toggle
              label="Closes the case"
              checked={isTerminal}
              onChange={setIsTerminal}
              hint="Counts as finished for days-open."
            />
          </div>
        </form>
      ) : null}

      {/* ---- this type's own statuses ---- */}
      {statuses.length > 0 ? (
        <ol className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-raised">
          {statuses.map((status, index) => (
            <li key={status.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: status.color }}
              />
              <span className="min-w-40 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{status.label}</span>
                <span className="tabular block truncate font-mono text-2xs text-ink-muted">
                  {status.key} · {status.caseCount} case{status.caseCount === 1 ? '' : 's'}
                </span>
              </span>

              <span className="flex flex-wrap gap-1">
                {status.isInitial ? <Badge tone="accent">Start</Badge> : null}
                {status.requiresReview ? <Badge>Reviewer</Badge> : null}
                {status.isTerminal ? <Badge>Closes</Badge> : null}
              </span>

              <span className="flex shrink-0 items-center">
                <IconButton
                  label={`Move ${status.label} earlier`}
                  disabled={index === 0 || pending}
                  onClick={() => run(() => moveStatus(status.id, caseTypeId, 'up'))}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move ${status.label} later`}
                  disabled={index === statuses.length - 1 || pending}
                  onClick={() => run(() => moveStatus(status.id, caseTypeId, 'down'))}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Delete ${status.label}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete the "${status.label}" status?`)) {
                      run(() => deleteStatus(status.id, caseTypeId));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
              </span>

              <div className="flex w-full flex-wrap gap-4 pl-5">
                <Toggle
                  label="Start"
                  checked={status.isInitial}
                  onChange={(v) => run(() => updateStatus(status.id, caseTypeId, { is_initial: v }))}
                />
                <Toggle
                  label="Reviewer"
                  checked={status.requiresReview}
                  onChange={(v) =>
                    run(() => updateStatus(status.id, caseTypeId, { requires_review_role: v }))
                  }
                />
                <Toggle
                  label="Closes"
                  checked={status.isTerminal}
                  onChange={(v) => run(() => updateStatus(status.id, caseTypeId, { is_terminal: v }))}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {/* ---- inherited ---- */}
      {inherited.length > 0 ? (
        <div>
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">
            Organisation-wide pipeline {usingInherited ? '(in use)' : '(not used by this type)'}
          </p>
          <ol
            className={`flex flex-wrap gap-1.5 rounded-lg border border-edge p-2.5 ${
              usingInherited ? 'bg-raised' : 'bg-sunken opacity-60'
            }`}
          >
            {inherited.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-1.5 rounded-full border border-edge bg-raised px-2 py-0.5"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-xs text-ink-secondary">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {statuses.length === 0 && inherited.length === 0 ? (
        <EmptyState
          title="No statuses anywhere"
          description="Without a status a new case has nowhere to start. Add one here, or define an organisation-wide set."
        />
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-1.5 text-xs text-ink-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
      />
      <span>
        {label}
        {hint ? <span className="block text-2xs text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
