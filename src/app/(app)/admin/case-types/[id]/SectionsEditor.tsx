'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  createField,
  createSection,
  deleteField,
  deleteSection,
  moveField,
  moveSection,
} from '@/lib/actions/case-types';
import { Badge, Button, EmptyState } from '@/components/ui';
import { Icon, ICON_NAMES } from '@/components/ui/icon';

export interface SectionRow {
  id: string;
  key: string;
  label: string;
  icon: string;
  tabKey: string;
  tabLabel: string;
  isRequired: boolean;
  completionRule: string;
  fields: {
    id: string;
    key: string;
    label: string;
    fieldType: string;
    helpText: string | null;
    width: string;
    required: boolean;
    choices: { value: string; label: string }[];
  }[];
}

const FIELD_TYPES = [
  ['text', 'Text'],
  ['textarea', 'Long text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['select', 'Single choice'],
  ['multiselect', 'Multiple choice'],
  ['boolean', 'Yes / no'],
  ['photo', 'Photos'],
  ['file', 'File'],
  ['signature', 'Signature'],
  ['person_ref', 'Person on the case'],
  ['computed', 'Computed'],
] as const;

export function SectionsEditor({
  caseTypeId,
  sections,
}: {
  caseTypeId: string;
  sections: SectionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(sections[0]?.id ?? null);
  const [addingSection, setAddingSection] = React.useState(false);

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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Sections and fields</h2>
        {!addingSection ? (
          <Button size="sm" onClick={() => setAddingSection(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add section
          </Button>
        ) : null}
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

      {addingSection ? (
        <AddSectionForm
          pending={pending}
          onCancel={() => setAddingSection(false)}
          onSubmit={(values) =>
            run(
              () => createSection({ caseTypeId, ...values }),
              () => setAddingSection(false),
            )
          }
        />
      ) : null}

      {sections.length === 0 && !addingSection ? (
        <EmptyState
          title="No sections yet"
          description="A section is one entry in the case sidebar — Scene Documentation, Point of Entry, Findings. Add one, then give it fields."
        />
      ) : null}

      <ul className="space-y-2">
        {sections.map((section, index) => (
          <li key={section.id} className="overflow-hidden rounded-lg border border-edge bg-raised">
            {/* ---- section header ---- */}
            <div className="flex items-center gap-2 p-2.5">
              <button
                type="button"
                onClick={() => setOpen(open === section.id ? null : section.id)}
                aria-expanded={open === section.id}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left"
              >
                {open === section.id ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                )}
                <Icon name={section.icon} className="h-4 w-4 shrink-0 text-ink-secondary" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {section.label}
                  </span>
                  <span className="tabular block truncate font-mono text-2xs text-ink-muted">
                    {section.key} · {section.tabLabel} · {section.fields.length} field
                    {section.fields.length === 1 ? '' : 's'}
                  </span>
                </span>
                {section.isRequired ? <Badge>Required</Badge> : null}
              </button>

              <div className="flex shrink-0 items-center">
                <IconButton
                  label={`Move ${section.label} up`}
                  disabled={index === 0 || pending}
                  onClick={() => run(() => moveSection(section.id, caseTypeId, 'up'))}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move ${section.label} down`}
                  disabled={index === sections.length - 1 || pending}
                  onClick={() => run(() => moveSection(section.id, caseTypeId, 'down'))}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Delete ${section.label}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete the "${section.label}" section and its fields?`)) {
                      run(() => deleteSection(section.id, caseTypeId));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            {/* ---- fields ---- */}
            {open === section.id ? (
              <div className="border-t border-edge bg-sunken p-2.5">
                {section.fields.length > 0 ? (
                  <ul className="mb-2.5 space-y-1">
                    {section.fields.map((field, fieldIndex) => (
                      <li
                        key={field.id}
                        className="flex items-center gap-2 rounded border border-edge bg-raised px-2.5 py-1.5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            {field.label}
                            {field.required ? <span className="text-danger"> *</span> : null}
                          </span>
                          <span className="tabular block truncate font-mono text-2xs text-ink-muted">
                            {field.key} · {field.fieldType}
                            {field.choices.length ? ` · ${field.choices.length} choices` : ''}
                          </span>
                        </span>
                        <IconButton
                          label={`Move ${field.label} up`}
                          disabled={fieldIndex === 0 || pending}
                          onClick={() =>
                            run(() => moveField(field.id, section.id, caseTypeId, 'up'))
                          }
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Move ${field.label} down`}
                          disabled={fieldIndex === section.fields.length - 1 || pending}
                          onClick={() =>
                            run(() => moveField(field.id, section.id, caseTypeId, 'down'))
                          }
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Delete ${field.label}`}
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(`Delete the "${field.label}" field?`)) {
                              run(() => deleteField(field.id, caseTypeId));
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <AddFieldForm
                  pending={pending}
                  onSubmit={(values) =>
                    run(() => createField({ sectionId: section.id, caseTypeId, ...values }))
                  }
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ bits --- */

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 enabled:cursor-pointer"
    >
      {children}
    </button>
  );
}

function AddSectionForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (v: { label: string; icon: string; tabKey: string; tabLabel: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = React.useState('');
  const [icon, setIcon] = React.useState('circle');
  const [tabLabel, setTabLabel] = React.useState('Documentation');

  return (
    <form
      className="rounded-lg border border-edge bg-raised p-3 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          label,
          icon,
          tabKey: tabLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'documentation',
          tabLabel,
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-44 flex-1">
          <label htmlFor="sec-label" className="mb-1.5 block text-sm font-medium text-ink">
            Section label
          </label>
          <input
            id="sec-label"
            autoFocus
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Point of Entry"
            className="h-9 w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
          />
        </div>
        <div>
          <label htmlFor="sec-icon" className="mb-1.5 block text-sm font-medium text-ink">
            Icon
          </label>
          <select
            id="sec-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-9 rounded border border-edge-strong bg-raised px-2 text-base text-ink"
          >
            {ICON_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sec-tab" className="mb-1.5 block text-sm font-medium text-ink">
            Tab
          </label>
          <input
            id="sec-tab"
            value={tabLabel}
            onChange={(e) => setTabLabel(e.target.value)}
            className="h-9 w-36 rounded border border-edge-strong bg-raised px-3 text-base text-ink"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={pending}>
            Add
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Sections sharing a tab name are grouped under one tab on the case page.
      </p>
    </form>
  );
}

function AddFieldForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (v: {
    label: string;
    fieldType: (typeof FIELD_TYPES)[number][0];
    required: boolean;
    choices?: string;
    helpText?: string;
  }) => void;
}) {
  const [label, setLabel] = React.useState('');
  const [fieldType, setFieldType] =
    React.useState<(typeof FIELD_TYPES)[number][0]>('text');
  const [required, setRequired] = React.useState(false);
  const [choices, setChoices] = React.useState('');
  const needsChoices = fieldType === 'select' || fieldType === 'multiselect';

  return (
    <form
      className="rounded border border-dashed border-edge-strong bg-raised p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ label, fieldType, required, choices: needsChoices ? choices : undefined });
        setLabel('');
        setChoices('');
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
            New field
          </label>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Method of entry"
            className="h-8 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
          />
        </div>

        <select
          aria-label="Field type"
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value as (typeof FIELD_TYPES)[number][0])}
          className="h-8 rounded border border-edge-strong bg-raised px-1.5 text-sm text-ink"
        >
          {FIELD_TYPES.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>

        <label className="flex h-8 cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
          />
          Required
        </label>

        <Button type="submit" size="sm" loading={pending}>
          Add field
        </Button>
      </div>

      {needsChoices ? (
        <div className="mt-2">
          <label htmlFor="choices" className="mb-1 block text-2xs text-ink-muted">
            Choices, one per line or comma separated
          </label>
          <textarea
            id="choices"
            required
            rows={2}
            value={choices}
            onChange={(e) => setChoices(e.target.value)}
            placeholder="Forced, Unlocked door, Window, Unknown"
            className="w-full rounded border border-edge-strong bg-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-muted"
          />
        </div>
      ) : null}
    </form>
  );
}
