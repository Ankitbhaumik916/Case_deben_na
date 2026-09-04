'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Pencil, X } from 'lucide-react';
import { updateCaseDetails } from '@/lib/actions/cases';
import { Button } from '@/components/ui';

/**
 * The case's own particulars, editable in place.
 *
 * Collapsed to a single button by default: the header above already shows all
 * of this, and repeating it as a permanently open form would be noise on a page
 * whose job is the case file rather than the case record.
 *
 * Position is not here on purpose — it belongs to the map card, which knows how
 * to geocode an address and how precise a match it got back.
 */

export interface CaseDetails {
  caseNumber: string;
  title: string;
  address: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  incidentDate: string;
  leadInvestigatorId: string;
}

export interface OrgMember {
  id: string;
  name: string;
}

export function CaseDetailsCard({
  caseId,
  details,
  members,
  canWrite,
}: {
  caseId: string;
  details: CaseDetails;
  members: OrgMember[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<CaseDetails>(details);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  // A revalidate elsewhere on the page hands down fresh details. Adopt them
  // while the form is closed; never while someone is part-way through typing.
  React.useEffect(() => {
    if (!open) setForm(details);
  }, [details, open]);

  const set = (key: keyof CaseDetails) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (!canWrite) return null;

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-edge-strong bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors duration-150 hover:bg-sunken hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit case details
        </button>
        {saved ? (
          <span role="status" className="ml-2 self-center text-xs text-[color:var(--success)]">
            Saved
          </span>
        ) : null}
      </div>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateCaseDetails({
      caseId,
      caseNumber: form.caseNumber,
      title: form.title,
      address: form.address,
      addressLine2: form.addressLine2,
      city: form.city,
      county: form.county,
      state: form.state,
      postalCode: form.postalCode,
      incidentDate: form.incidentDate,
      leadInvestigatorId: form.leadInvestigatorId || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-edge bg-raised p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Case details</h2>
        <button
          type="button"
          onClick={() => {
            setForm(details);
            setError(null);
            setOpen(false);
          }}
          aria-label="Close without saving"
          className="cursor-pointer rounded p-1 text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-6">
        <Field
          className="sm:col-span-2"
          id="cd-number"
          label="Case number"
          value={form.caseNumber}
          onChange={set('caseNumber')}
          mono
        />
        <Field
          className="sm:col-span-4"
          id="cd-title"
          label="Short description"
          value={form.title}
          onChange={set('title')}
          placeholder="Warehouse inventory shortfall"
        />

        <Field
          className="sm:col-span-4"
          id="cd-address"
          label="Address"
          value={form.address}
          onChange={set('address')}
        />
        <Field
          className="sm:col-span-2"
          id="cd-address2"
          label="Address line 2"
          value={form.addressLine2}
          onChange={set('addressLine2')}
        />

        <Field className="sm:col-span-2" id="cd-city" label="City" value={form.city} onChange={set('city')} />
        <Field className="sm:col-span-2" id="cd-county" label="County" value={form.county} onChange={set('county')} />
        <Field className="sm:col-span-1" id="cd-state" label="State" value={form.state} onChange={set('state')} />
        <Field
          className="sm:col-span-1"
          id="cd-postal"
          label="Postcode"
          value={form.postalCode}
          onChange={set('postalCode')}
        />

        <Field
          className="sm:col-span-2"
          id="cd-incident"
          label="Date of incident"
          type="date"
          value={form.incidentDate}
          onChange={set('incidentDate')}
        />

        <div className="sm:col-span-4">
          <label htmlFor="cd-lead" className="mb-1.5 block text-sm font-medium text-ink">
            Lead investigator
          </label>
          <select
            id="cd-lead"
            value={form.leadInvestigatorId}
            onChange={(e) => set('leadInvestigatorId')(e.target.value)}
            className="h-9 w-full cursor-pointer rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink"
          >
            <option value="">Not assigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" loading={busy} onClick={() => void save()}>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Save details
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setForm(details);
            setError(null);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
        <p className="ml-auto text-2xs text-ink-muted">
          Position and status are changed on the map card and the pipeline.
        </p>
      </div>
    </section>
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
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  mono?: boolean;
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
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={
          mono
            ? 'tabular h-9 w-full rounded border border-edge-strong bg-raised px-2.5 font-mono text-sm text-ink'
            : 'h-9 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted'
        }
      />
    </div>
  );
}
