'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, FileText, Plus, Trash2 } from 'lucide-react';
import {
  createReportSection,
  deleteReportSection,
  moveReportSection,
  updateReportSection,
} from '@/lib/actions/case-type-config';
import { Badge, Button, EmptyState } from '@/components/ui';
import { ErrorNote, IconButton, useAction } from './EditorBits';

export interface ReportSectionRow {
  id: string;
  heading: string;
  draftPrompt: string | null;
  includeByDefault: boolean;
  sourceSectionIds: string[];
}

export function ReportTemplateEditor({
  caseTypeId,
  reportSections,
  sections,
}: {
  caseTypeId: string;
  reportSections: ReportSectionRow[];
  sections: { id: string; label: string }[];
}) {
  const { run, pending, error } = useAction();
  const [adding, setAdding] = React.useState(false);

  const sectionLabel = new Map(sections.map((s) => [s.id, s.label]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Report structure</h2>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add report section
          </Button>
        ) : null}
      </div>

      <p className="max-w-prose text-sm text-ink-secondary">
        Each row becomes a heading in the generated report. The sections you tick supply the
        field values that get fed to the drafting prompt; the draft is always editable
        before anything is exported, which is the point — a forensic report goes out under
        a person&rsquo;s name, not a model&rsquo;s.
      </p>

      <ErrorNote message={error} />

      {adding ? (
        <ReportSectionForm
          sections={sections}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSubmit={(values) =>
            run(
              () => createReportSection({ caseTypeId, ...values }),
              () => setAdding(false),
            )
          }
        />
      ) : null}

      {reportSections.length === 0 && !adding ? (
        <EmptyState
          icon={FileText}
          title="No report structure yet"
          description="Without it, generating a report for this case type produces nothing but the raw field values."
        />
      ) : null}

      <ol className="space-y-2">
        {reportSections.map((section, index) => (
          <li key={section.id} className="rounded-lg border border-edge bg-raised p-2.5">
            <div className="flex items-start gap-2">
              <span className="tabular mt-0.5 shrink-0 font-mono text-xs text-ink-muted">
                {index + 1}.
              </span>

              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium text-ink">{section.heading}</p>

                <p className="mt-0.5 flex flex-wrap items-center gap-1">
                  {section.sourceSectionIds.length ? (
                    section.sourceSectionIds.map((id) => (
                      <span
                        key={id}
                        className="rounded-sm border border-edge bg-sunken px-1.5 py-0.5 text-2xs text-ink-secondary"
                      >
                        {sectionLabel.get(id) ?? 'missing section'}
                      </span>
                    ))
                  ) : (
                    <span className="text-2xs text-ink-muted">
                      No source sections — this heading will draft from nothing.
                    </span>
                  )}
                  {!section.includeByDefault ? <Badge>Excluded by default</Badge> : null}
                </p>

                {section.draftPrompt ? (
                  <p className="mt-1.5 line-clamp-3 border-l-2 border-edge pl-2 text-xs italic text-ink-secondary">
                    {section.draftPrompt}
                  </p>
                ) : (
                  <p className="mt-1.5 text-2xs text-ink-muted">
                    No drafting prompt — this section will render the raw field values.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center">
                <IconButton
                  label={`Move ${section.heading} up`}
                  disabled={index === 0 || pending}
                  onClick={() => run(() => moveReportSection(section.id, caseTypeId, 'up'))}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Move ${section.heading} down`}
                  disabled={index === reportSections.length - 1 || pending}
                  onClick={() => run(() => moveReportSection(section.id, caseTypeId, 'down'))}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Delete ${section.heading}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete the "${section.heading}" report section?`)) {
                      run(() => deleteReportSection(section.id, caseTypeId));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            <label className="mt-2 flex cursor-pointer items-center gap-1.5 pl-6 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={section.includeByDefault}
                onChange={(e) =>
                  run(() =>
                    updateReportSection(section.id, caseTypeId, {
                      include_by_default: e.target.checked,
                    }),
                  )
                }
                className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
              />
              Included in a new report by default
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReportSectionForm({
  sections,
  pending,
  onSubmit,
  onCancel,
}: {
  sections: { id: string; label: string }[];
  pending: boolean;
  onSubmit: (v: { heading: string; sourceSectionIds: string[]; draftPrompt?: string }) => void;
  onCancel: () => void;
}) {
  const [heading, setHeading] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [prompt, setPrompt] = React.useState('');

  return (
    <form
      className="space-y-3 rounded-lg border border-edge bg-raised p-3 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ heading, sourceSectionIds: selected, draftPrompt: prompt });
      }}
    >
      <div>
        <label htmlFor="rs-heading" className="mb-1.5 block text-sm font-medium text-ink">
          Heading
        </label>
        <input
          id="rs-heading"
          autoFocus
          required
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder="Findings and Conclusions"
          className="h-9 w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-ink">
          Which sections feed it
        </legend>
        {sections.length === 0 ? (
          <p className="text-xs text-ink-muted">
            This case type has no sections yet — add some first, or this heading drafts from
            nothing.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sections.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                    )
                  }
                  className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="rs-prompt" className="mb-1.5 block text-sm font-medium text-ink">
          Drafting instruction
        </label>
        <textarea
          id="rs-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the scene as documented, in neutral third person past tense. State observations only; draw no conclusions."
          className="w-full rounded border border-edge-strong bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
        />
        <p className="mt-1 text-2xs text-ink-muted">
          Say what the section should cover, in what voice, and what it must not do. Leave it
          blank to render the raw field values instead of a narrative.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Add section
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
