import { Icon } from '@/components/ui/icon';
import type { SectionRow } from './SectionsEditor';

/**
 * What an investigator will see, rendered from the same rows the editor is
 * writing. Server-rendered, so it cannot drift from the template: every save
 * revalidates this route and the preview redraws from the database rather than
 * from a second copy of the state held in the browser.
 *
 * This is the thing that makes "no-code" true for a non-technical admin — the
 * feedback loop between changing a template and seeing the form.
 */
export function TemplatePreview({
  caseTypeName,
  sections,
}: {
  caseTypeName: string;
  sections: SectionRow[];
}) {
  const tabs = [...new Map(sections.map((s) => [s.tabKey, s.tabLabel])).entries()];
  const active = sections[0];

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-muted">
        Investigator&rsquo;s view
      </p>

      <div className="overflow-hidden rounded-lg border border-edge bg-raised shadow-sm">
        {/* case header */}
        <div className="border-b border-edge bg-sunken px-3 py-2.5">
          <p className="tabular font-mono text-xs text-ink-muted">CASE-0000</p>
          <p className="truncate text-sm font-semibold text-ink">{caseTypeName}</p>
        </div>

        {/* tab bar, derived from distinct section groupings */}
        {tabs.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto border-b border-edge px-3">
            {tabs.map(([key, label], i) => (
              <span
                key={key}
                className={`whitespace-nowrap border-b-2 py-2 text-xs ${
                  i === 0
                    ? 'border-accent font-medium text-ink'
                    : 'border-transparent text-ink-muted'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {sections.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-ink-muted">
            Add a section and it appears here.
          </p>
        ) : (
          <div className="grid grid-cols-[130px_minmax(0,1fr)]">
            {/* sidebar */}
            <ul className="border-r border-edge py-1.5">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${
                      i === 0 ? 'bg-sunken font-medium text-ink' : 'text-ink-secondary'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-edge-strong"
                      title="Completion dot"
                    />
                    <Icon name={s.icon} className="h-3 w-3 shrink-0 text-ink-muted" />
                    <span className="truncate">{s.label}</span>
                  </span>
                </li>
              ))}
            </ul>

            {/* the active section's fields */}
            <div className="space-y-2.5 p-3">
              {active && active.fields.length > 0 ? (
                active.fields.map((f) => (
                  <div key={f.id}>
                    <p className="mb-1 text-2xs font-medium text-ink">
                      {f.label}
                      {f.required ? <span className="text-danger"> *</span> : null}
                    </p>
                    <FieldSketch type={f.fieldType} choices={f.choices} />
                    {f.helpText ? (
                      <p className="mt-0.5 text-2xs text-ink-muted">{f.helpText}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-ink-muted">
                  {active ? `"${active.label}" has no fields yet.` : 'No fields yet.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-2xs text-ink-muted">
        Drawn from the saved template, not a mock-up. It redraws after each change.
      </p>
    </aside>
  );
}

/** A miniature of each field_type, so the shape of the form is legible at a glance. */
function FieldSketch({
  type,
  choices,
}: {
  type: string;
  choices: { value: string; label: string }[];
}) {
  const box = 'rounded border border-edge bg-sunken';

  switch (type) {
    case 'textarea':
      return <div className={`${box} h-10`} />;
    case 'boolean':
      return (
        <span className="flex items-center gap-1.5">
          <span className={`${box} h-3.5 w-3.5`} />
          <span className="text-2xs text-ink-muted">Yes / no</span>
        </span>
      );
    case 'select':
    case 'multiselect':
      return (
        <div className="flex flex-wrap gap-1">
          {(choices.length ? choices.slice(0, 4) : [{ value: '', label: 'no choices set' }]).map(
            (c, i) => (
              <span
                key={c.value || i}
                className="rounded-sm border border-edge bg-sunken px-1.5 py-0.5 text-2xs text-ink-secondary"
              >
                {c.label}
              </span>
            ),
          )}
          {choices.length > 4 ? (
            <span className="px-1 py-0.5 text-2xs text-ink-muted">+{choices.length - 4}</span>
          ) : null}
        </div>
      );
    case 'photo':
    case 'file':
      return (
        <div className={`${box} flex h-9 items-center justify-center text-2xs text-ink-muted`}>
          {type === 'photo' ? 'Drop photos' : 'Attach a file'}
        </div>
      );
    case 'signature':
      return (
        <div className={`${box} flex h-9 items-center justify-center text-2xs italic text-ink-muted`}>
          Sign here
        </div>
      );
    case 'date':
      return <div className={`${box} h-6 w-28`} />;
    case 'number':
      return <div className={`${box} h-6 w-20`} />;
    case 'person_ref':
      return (
        <div className={`${box} flex h-6 items-center px-1.5 text-2xs text-ink-muted`}>
          Pick a person on the case
        </div>
      );
    case 'computed':
      return (
        <div className="flex h-6 items-center text-2xs italic text-ink-muted">
          Calculated automatically
        </div>
      );
    default:
      return <div className={`${box} h-6`} />;
  }
}
