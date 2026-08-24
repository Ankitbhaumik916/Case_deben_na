'use client';

import * as React from 'react';
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
} from '@/lib/actions/case-type-config';
import { Badge, Button, EmptyState } from '@/components/ui';
import { ErrorNote, IconButton, useAction } from './EditorBits';

export interface ChecklistRow {
  id: string;
  name: string;
  sourceStandard: string | null;
  version: string | null;
  items: {
    id: string;
    label: string;
    sectionRef: string | null;
    isRequired: boolean;
  }[];
}

export function ChecklistEditor({
  caseTypeId,
  checklists,
  sections,
}: {
  caseTypeId: string;
  checklists: ChecklistRow[];
  sections: { key: string; label: string }[];
}) {
  const { run, pending, error } = useAction();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [standard, setStandard] = React.useState('');
  const [version, setVersion] = React.useState('');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Compliance checklist</h2>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add checklist
          </Button>
        ) : null}
      </div>

      <p className="max-w-prose text-sm text-ink-secondary">
        Attach whatever standard the discipline answers to — a certification body, an
        internal SOP, a client&rsquo;s requirements. Nothing here is specific to any one
        standard; it is a list of checks an investigator ticks off, grouped by the section
        they belong to.
      </p>

      <ErrorNote message={error} />

      {adding ? (
        <form
          className="rounded-lg border border-edge bg-raised p-3 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createChecklist({
                  caseTypeId,
                  name,
                  sourceStandard: standard,
                  version,
                }),
              () => {
                setName('');
                setStandard('');
                setVersion('');
                setAdding(false);
              },
            );
          }}
        >
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-44 flex-1">
              <label htmlFor="cl-name" className="mb-1.5 block text-sm font-medium text-ink">
                Checklist name
              </label>
              <input
                id="cl-name"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Scene Examination Checklist"
                className="h-9 w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
              />
            </div>
            <div>
              <label htmlFor="cl-std" className="mb-1.5 block text-sm font-medium text-ink">
                Standard
              </label>
              <input
                id="cl-std"
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                placeholder="Internal SOP"
                className="h-9 w-44 rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
              />
            </div>
            <div>
              <label htmlFor="cl-ver" className="mb-1.5 block text-sm font-medium text-ink">
                Version
              </label>
              <input
                id="cl-ver"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="2026.1"
                className="h-9 w-24 rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
              />
            </div>
            <Button type="submit" size="sm" loading={pending}>
              Add
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {checklists.length === 0 && !adding ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No checklist yet"
          description="Without one, the compliance tab on a case of this type stays empty."
        />
      ) : null}

      {checklists.map((checklist) => (
        <div key={checklist.id} className="overflow-hidden rounded-lg border border-edge bg-raised">
          <div className="flex items-center gap-2 border-b border-edge p-2.5">
            <div className="min-w-40 flex-1">
              <p className="text-sm font-medium text-ink">{checklist.name}</p>
              <p className="text-2xs text-ink-muted">
                {[checklist.sourceStandard, checklist.version].filter(Boolean).join(' · ') ||
                  'No standard recorded'}
                {' · '}
                {checklist.items.length} check{checklist.items.length === 1 ? '' : 's'}
              </p>
            </div>
            <IconButton
              label={`Delete ${checklist.name}`}
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete "${checklist.name}" and its checks?`)) {
                  run(() => deleteChecklist(checklist.id, caseTypeId));
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
          </div>

          {checklist.items.length > 0 ? (
            <ol className="divide-y divide-edge">
              {checklist.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 px-2.5 py-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-edge-strong"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{item.label}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {item.sectionRef ? (
                        <span className="tabular font-mono text-2xs text-ink-muted">
                          {item.sectionRef}
                        </span>
                      ) : (
                        <span className="text-2xs text-ink-muted">ungrouped</span>
                      )}
                      {!item.isRequired ? <Badge>Optional</Badge> : null}
                    </span>
                  </span>
                  <IconButton
                    label={`Delete check: ${item.label}`}
                    disabled={pending}
                    onClick={() => run(() => deleteChecklistItem(item.id, caseTypeId))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ol>
          ) : null}

          <AddCheckForm
            pending={pending}
            sections={sections}
            onSubmit={(values) =>
              run(() => createChecklistItem({ checklistId: checklist.id, caseTypeId, ...values }))
            }
          />
        </div>
      ))}
    </div>
  );
}

function AddCheckForm({
  pending,
  sections,
  onSubmit,
}: {
  pending: boolean;
  sections: { key: string; label: string }[];
  onSubmit: (v: { label: string; sectionRef?: string; isRequired: boolean }) => void;
}) {
  const [label, setLabel] = React.useState('');
  const [sectionRef, setSectionRef] = React.useState('');
  const [isRequired, setIsRequired] = React.useState(true);

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-edge bg-sunken p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ label, sectionRef: sectionRef || undefined, isRequired });
        setLabel('');
      }}
    >
      <div className="min-w-52 flex-1">
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
          New check
        </label>
        <input
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Scene photographed before anything was moved"
          className="h-8 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
        />
      </div>

      <select
        aria-label="Group under section"
        value={sectionRef}
        onChange={(e) => setSectionRef(e.target.value)}
        className="h-8 rounded border border-edge-strong bg-raised px-1.5 text-sm text-ink"
      >
        <option value="">Ungrouped</option>
        {sections.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>

      <label className="flex h-8 cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
        />
        Required
      </label>

      <Button type="submit" size="sm" loading={pending}>
        Add check
      </Button>
    </form>
  );
}
