'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Search box, filter panel and the chips for what is currently applied.
 *
 * Filter state lives in the URL rather than component state: a filtered list is
 * then linkable, survives a refresh, and the page can stay a Server Component
 * that queries with the filters already applied instead of fetching everything
 * and narrowing it in the browser.
 *
 * Every option offered here is read from the organisation's own configuration —
 * its case types, its statuses, the counties its cases actually mention.
 */
export function CaseFilters({
  types,
  statuses,
  counties,
  current,
}: {
  types: { slug: string; name: string }[];
  statuses: { key: string; label: string; color: string }[];
  counties: string[];
  current: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState(current.q ?? '');

  React.useEffect(() => {
    setQ(current.q ?? '');
  }, [current.q]);

  const apply = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`/cases?${next.toString()}`);
    },
    [params, router],
  );

  const chips = [
    current.q ? { key: 'q', label: `“${current.q}”` } : null,
    current.type
      ? { key: 'type', label: types.find((t) => t.slug === current.type)?.name ?? current.type }
      : null,
    current.status
      ? {
          key: 'status',
          label: statuses.find((s) => s.key === current.status)?.label ?? current.status,
        }
      : null,
    current.county ? { key: 'county', label: current.county } : null,
    current.from ? { key: 'from', label: `from ${current.from}` } : null,
    current.to ? { key: 'to', label: `to ${current.to}` } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() || undefined });
          }}
        >
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Case number, address, a person's name, anything recorded on a case…"
            aria-label="Search cases"
            className="h-9 w-full rounded border border-edge-strong bg-raised pl-8 pr-3 text-base text-ink placeholder:text-ink-muted"
          />
        </form>

        <Button
          variant="secondary"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(chips.length > 0 && 'border-accent text-accent')}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {chips.length > 0 ? (
            <span className="tabular font-mono text-2xs">({chips.length})</span>
          ) : null}
        </Button>
      </div>

      {open ? (
        <div className="grid gap-3 rounded-lg border border-edge bg-raised p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Case type"
            value={current.type ?? ''}
            onChange={(v) => apply({ type: v || undefined })}
            options={types.map((t) => ({ value: t.slug, label: t.name }))}
          />
          <Select
            label="Status"
            value={current.status ?? ''}
            onChange={(v) => apply({ status: v || undefined })}
            options={statuses.map((s) => ({ value: s.key, label: s.label }))}
          />
          <Select
            label="County"
            value={current.county ?? ''}
            onChange={(v) => apply({ county: v || undefined })}
            options={counties.map((c) => ({ value: c, label: c }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <DateField
              label="Created from"
              value={current.from ?? ''}
              onChange={(v) => apply({ from: v || undefined })}
            />
            <DateField
              label="to"
              value={current.to ?? ''}
              onChange={(v) => apply({ to: v || undefined })}
            />
          </div>
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => apply({ [chip.key]: undefined })}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-edge bg-sunken py-0.5 pl-2 pr-1 text-xs text-ink-secondary transition-colors duration-150 hover:border-edge-strong hover:text-ink"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => router.push('/cases')}
            className="cursor-pointer px-1.5 text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded border border-edge-strong bg-raised px-2 text-base text-ink"
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded border border-edge-strong bg-raised px-2 text-sm text-ink"
      />
    </div>
  );
}
