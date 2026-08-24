'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { createCase } from '@/lib/actions/cases';
import { Button } from '@/components/ui';

export function NewCaseForm({
  orgId,
  caseTypeId,
  suggestion,
}: {
  orgId: string;
  caseTypeId: string;
  suggestion: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    caseNumber: suggestion,
    title: '',
    address: '',
    city: '',
    county: '',
    state: '',
    incidentDate: '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await createCase({ orgId, caseTypeId, ...form });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.push(`/cases/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-edge bg-raised p-4 shadow-sm" noValidate>
      <Field
        id="caseNumber"
        label="Case number"
        value={form.caseNumber}
        onChange={set('caseNumber')}
        required
        mono
        hint="Suggested from the count so far. Use whatever numbering your agency runs."
      />
      <Field id="title" label="Short description" value={form.title} onChange={set('title')} placeholder="Warehouse inventory shortfall" />
      <Field id="address" label="Address" value={form.address} onChange={set('address')} placeholder="1420 Foundry Street" />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="city" label="City" value={form.city} onChange={set('city')} />
        <Field id="county" label="County" value={form.county} onChange={set('county')} />
        <Field id="state" label="State" value={form.state} onChange={set('state')} />
      </div>

      <Field id="incidentDate" label="Date of incident" type="date" value={form.incidentDate} onChange={set('incidentDate')} />

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting}>
          {submitting ? 'Creating…' : 'Create case'}
        </Button>
        <p className="text-xs text-ink-muted">
          It opens on the case type&rsquo;s first status. Sections get filled in afterwards.
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  placeholder,
  hint,
  type = 'text',
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
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
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`h-9 w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted ${mono ? 'font-mono tabular' : ''}`}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
