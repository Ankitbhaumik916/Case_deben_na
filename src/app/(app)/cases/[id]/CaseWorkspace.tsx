'use client';

import * as React from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { saveFieldValue, setSectionComplete } from '@/lib/actions/case-values';
import {
  DynamicField,
  isFilled,
  STORAGE_FIELD_TYPES,
  type FieldDef,
  type PersonOption,
} from '@/components/fields/DynamicField';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export interface SectionDef {
  id: string;
  key: string;
  label: string;
  icon: string;
  tabKey: string;
  tabLabel: string;
  isRequired: boolean;
  completionRule: string;
  manuallyComplete: boolean;
  fields: FieldDef[];
}

type Completion = 'empty' | 'partial' | 'complete';

/**
 * The case file.
 *
 * Sidebar, tab bar and every input are rendered from the case type's rows —
 * there is nothing here that knows what a fire investigation is. Values are
 * held locally so typing stays responsive, and committed on blur; the dots and
 * counts recompute from that local state, so they move as you work rather than
 * after a round trip.
 */
export function CaseWorkspace({
  caseId,
  sections,
  initialValues,
  people,
  canWrite,
  attachments = {},
}: {
  caseId: string;
  sections: SectionDef[];
  initialValues: Record<string, unknown>;
  people: PersonOption[];
  canWrite: boolean;
  /** Library files per field id, for the storage-backed field types. */
  attachments?: Record<string, number>;
}) {
  const [values, setValues] = React.useState(initialValues);
  const [attached, setAttached] = React.useState<Record<string, number>>(attachments);
  const [manual, setManual] = React.useState<Record<string, boolean>>(
    Object.fromEntries(sections.map((s) => [s.id, s.manuallyComplete])),
  );
  const [saving, setSaving] = React.useState(0);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const tabs = React.useMemo(
    () => [...new Map(sections.map((s) => [s.tabKey, s.tabLabel])).entries()],
    [sections],
  );
  const [tab, setTab] = React.useState(tabs[0]?.[0] ?? 'documentation');

  const visible = sections.filter((s) => s.tabKey === tab);
  const [activeSectionId, setActiveSectionId] = React.useState<string | null>(
    visible[0]?.id ?? null,
  );
  const active = visible.find((s) => s.id === activeSectionId) ?? visible[0];

  /*
   * Keep the section you are in.
   *
   * Every autosave calls revalidatePath, so the server component re-renders and
   * hands down a freshly built `sections` array. Keying a reset off that array's
   * identity meant each committed edit threw you back to the first section —
   * which read as "saving navigates you away". Only move when the section you
   * were looking at has genuinely gone (deleted, or it belongs to another tab).
   */
  React.useEffect(() => {
    setActiveSectionId((current) => {
      if (current && sections.some((s) => s.id === current && s.tabKey === tab)) return current;
      return sections.find((s) => s.tabKey === tab)?.id ?? null;
    });
  }, [tab, sections]);

  React.useEffect(() => {
    setAttached(attachments);
  }, [attachments]);

  /*
   * Is this field answered?
   *
   * A photo or file field is answered by a file in the library, never by a row
   * in case_field_values — so asking isFilled() about it always said no, and a
   * section containing one could never reach complete however many photographs
   * the case carried. Both the dot and the n/n count go through here, because
   * they used to disagree about what counted.
   */
  const answered = React.useCallback(
    (f: FieldDef) =>
      STORAGE_FIELD_TYPES.has(f.fieldType) ? (attached[f.id] ?? 0) > 0 : isFilled(values[f.id]),
    [attached, values],
  );

  function completionOf(section: SectionDef): Completion {
    if (section.completionRule === 'manual') {
      return manual[section.id] ? 'complete' : 'empty';
    }
    const fields = section.fields;
    if (fields.length === 0) return 'empty';

    const filled = fields.filter(answered);
    if (filled.length === 0) return 'empty';

    switch (section.completionRule) {
      case 'all_fields_filled':
        return filled.length === fields.length ? 'complete' : 'partial';
      case 'all_required_fields_filled': {
        const required = fields.filter((f) => f.required);
        if (required.length === 0) return filled.length === fields.length ? 'complete' : 'partial';
        return required.every(answered) ? 'complete' : 'partial';
      }
      case 'any_field_filled':
      default:
        return 'complete';
    }
  }

  async function commit(fieldId: string, value: unknown) {
    if (!canWrite) return;
    setError(null);
    setSaving((n) => n + 1);
    const result = await saveFieldValue({ caseId, fieldId, value });
    setSaving((n) => n - 1);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedAt(Date.now());
  }

  async function toggleManual(section: SectionDef, complete: boolean) {
    if (!canWrite) return;
    setManual((m) => ({ ...m, [section.id]: complete }));
    setSaving((n) => n + 1);
    const result = await setSectionComplete({ caseId, sectionId: section.id, complete });
    setSaving((n) => n - 1);
    if (!result.ok) {
      setError(result.error);
      setManual((m) => ({ ...m, [section.id]: !complete }));
      return;
    }
    setSavedAt(Date.now());
  }

  if (sections.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-edge-strong bg-sunken px-6 py-10 text-center text-sm text-ink-secondary">
        This case type has no sections yet. An administrator can add them in Admin → Case Types,
        and they appear here immediately.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* tab bar, derived from the sections' groupings */}
      {tabs.length > 1 ? (
        <nav aria-label="Case sections" className="flex gap-1 overflow-x-auto border-b border-edge">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={cn(
                '-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-150',
                tab === key
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-ink-secondary hover:border-edge-strong hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* sidebar */}
        <nav aria-label="Sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="overflow-hidden rounded-lg border border-edge bg-raised">
            {visible.map((section) => {
              const state = completionOf(section);
              const filled = section.fields.filter(answered).length;
              return (
                <li key={section.id} className="border-b border-edge last:border-0">
                  <button
                    type="button"
                    onClick={() => setActiveSectionId(section.id)}
                    aria-current={active?.id === section.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors duration-150',
                      active?.id === section.id
                        ? 'bg-sunken font-medium text-ink'
                        : 'text-ink-secondary hover:bg-sunken hover:text-ink',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        state === 'complete' && 'bg-[color:var(--success)]',
                        state === 'partial' && 'bg-[color:var(--accent)]',
                        state === 'empty' && 'bg-edge-strong',
                      )}
                    />
                    <Icon name={section.icon} className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    <span className="tabular shrink-0 font-mono text-2xs text-ink-muted">
                      {filled}/{section.fields.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 flex items-center gap-1.5 px-0.5 text-2xs text-ink-muted">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)]" />
            complete
            <span aria-hidden="true" className="ml-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
            started
            <span aria-hidden="true" className="ml-1.5 h-1.5 w-1.5 rounded-full bg-edge-strong" />
            empty
          </p>
        </nav>

        {/* the active section */}
        <div className="min-w-0 space-y-3">
          <div className="flex min-h-6 items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              {active ? <Icon name={active.icon} className="h-4 w-4 text-ink-secondary" /> : null}
              {active?.label}
            </h2>
            <SaveIndicator saving={saving > 0} savedAt={savedAt} canWrite={canWrite} />
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

          {active ? (
            <div className="rounded-lg border border-edge bg-raised p-4">
              {active.fields.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">
                  No fields configured for this section.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-6">
                  {active.fields.map((field) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={values[field.id]}
                      people={people}
                      libraryHref={`/cases/${caseId}?tab=library`}
                      caseId={caseId}
                      sectionId={active.id}
                      attached={attached[field.id] ?? 0}
                      onAttached={() =>
                        setAttached((a) => ({ ...a, [field.id]: (a[field.id] ?? 0) + 1 }))
                      }
                      disabled={!canWrite}
                      onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
                      onCommit={(v) => {
                        setValues((prev) => ({ ...prev, [field.id]: v }));
                        void commit(field.id, v);
                      }}
                    />
                  ))}
                </div>
              )}

              {active.completionRule === 'manual' ? (
                <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-edge pt-3 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={Boolean(manual[active.id])}
                    onChange={(e) => void toggleManual(active, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-[color:var(--accent)]"
                  />
                  Mark &ldquo;{active.label}&rdquo; complete
                  <span className="text-xs text-ink-muted">
                    This section is completed by hand, not by its fields.
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({
  saving,
  savedAt,
  canWrite,
}: {
  saving: boolean;
  savedAt: number | null;
  canWrite: boolean;
}) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  // "Saved" should decay to nothing rather than sit there claiming freshness.
  React.useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(force, 4000);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (!canWrite) {
    return <span className="text-xs text-ink-muted">Read-only</span>;
  }
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ink-muted" role="status">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (savedAt && Date.now() - savedAt < 4000) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[color:var(--success)]" role="status">
        <Check className="h-3 w-3" aria-hidden="true" />
        Saved
      </span>
    );
  }
  return <span className="text-xs text-ink-muted">Changes save as you go</span>;
}
