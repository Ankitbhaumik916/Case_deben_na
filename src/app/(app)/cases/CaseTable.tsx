'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Columns3, Download, FolderOpen, X } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { COLUMNS, DEFAULT_COLUMNS } from './columns';
import type { CaseRow } from './types';

export function CaseTable({
  cases,
  columns,
  hasFilters,
  canWrite,
}: {
  cases: CaseRow[];
  columns: string[];
  hasFilters: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [picking, setPicking] = React.useState(false);

  // Selecting rows then filtering would otherwise leave invisible rows selected
  // and silently export them.
  React.useEffect(() => {
    setSelected(new Set());
  }, [cases]);

  const visible = COLUMNS.filter((c) => columns.includes(c.key));
  const allOnPage = cases.length > 0 && cases.every((c) => selected.has(c.id));

  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(cases.map((c) => c.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setColumns(next: string[]) {
    const q = new URLSearchParams(params.toString());
    if (next.join(',') === DEFAULT_COLUMNS.join(',')) q.delete('cols');
    else q.set('cols', next.join(','));
    router.push(`/cases?${q.toString()}`);
  }

  function exportCsv() {
    const rows = cases.filter((c) => selected.has(c.id));
    const source = rows.length ? rows : cases;

    // Quote everything and double embedded quotes — a case address with a comma
    // would otherwise shift every later column in the export.
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = visible.map((c) => esc(c.label)).join(',');
    const body = source
      .map((row) => visible.map((c) => esc(cellText(row, c.key))).join(','))
      .join('\n');

    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cases-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (cases.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={hasFilters ? 'No cases match those filters' : 'No cases yet'}
        description={
          hasFilters
            ? 'Clear a filter above, or widen the date range.'
            : canWrite
              ? 'Create one to get started. Its sections and fields come from the case type you pick.'
              : 'Nothing has been filed in this organisation yet.'
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted" role="status">
          {selected.size > 0
            ? `${selected.size} selected`
            : `${cases.length} case${cases.length === 1 ? '' : 's'}`}
        </p>

        <div className="flex items-center gap-1.5">
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear selection
            </button>
          ) : null}

          <Button size="sm" variant="secondary" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
            <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            Columns
          </Button>

          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {selected.size > 0 ? `Export ${selected.size}` : 'Export all'}
          </Button>
        </div>
      </div>

      {picking ? (
        <div className="rounded-lg border border-edge bg-raised p-3 shadow-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {COLUMNS.map((c) => (
              <label
                key={c.key}
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  c.pinned ? 'text-ink-muted' : 'cursor-pointer text-ink-secondary',
                )}
              >
                <input
                  type="checkbox"
                  checked={columns.includes(c.key)}
                  disabled={c.pinned}
                  onChange={(e) =>
                    setColumns(
                      e.target.checked
                        ? COLUMNS.filter((x) => columns.includes(x.key) || x.key === c.key).map((x) => x.key)
                        : columns.filter((k) => k !== c.key),
                    )
                  }
                  className="h-3.5 w-3.5 accent-[color:var(--accent)] disabled:opacity-40"
                />
                {c.label}
                {c.pinned ? <span className="text-2xs">(always)</span> : null}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setColumns(DEFAULT_COLUMNS)}
            className="mt-2 cursor-pointer text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Reset to the standard layout
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-edge bg-raised">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge bg-sunken text-left">
              <th scope="col" className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={toggleAll}
                  aria-label={allOnPage ? 'Clear selection' : 'Select all shown'}
                  className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
                />
              </th>
              {visible.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-3 py-2 text-2xs font-medium uppercase tracking-wide text-ink-muted',
                    c.align === 'right' && 'text-right',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-edge last:border-0 hover:bg-sunken',
                  selected.has(row.id) && 'bg-accent-subtle/40',
                )}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`Select ${row.case_number}`}
                    className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
                  />
                </td>
                {visible.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-2 text-ink-secondary',
                      c.align === 'right' && 'text-right',
                      c.key === 'address' || c.key === 'title' ? 'max-w-56 truncate' : '',
                    )}
                  >
                    {renderCell(row, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Plain text for a cell — used by the CSV export so it matches what is on screen. */
function cellText(row: CaseRow, key: string): string {
  switch (key) {
    case 'created_at':
      return row.created_at.slice(0, 10);
    case 'days_open':
      return String(row.days_open);
    default:
      return String((row as unknown as Record<string, unknown>)[key] ?? '');
  }
}

function renderCell(row: CaseRow, key: string) {
  switch (key) {
    case 'case_number':
      return (
        <Link
          href={`/cases/${row.id}`}
          className="tabular whitespace-nowrap font-mono text-xs font-medium text-ink hover:text-accent"
        >
          {row.case_number}
        </Link>
      );
    case 'case_type_name':
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span style={{ color: row.case_type_color }}>
            <Icon name={row.case_type_icon} className="h-3.5 w-3.5" />
          </span>
          {row.case_type_name}
        </span>
      );
    case 'status_label':
      return <StatusPill label={row.status_label} color={row.status_color} size="sm" />;
    case 'days_open':
      return <span className="tabular font-mono text-xs">{row.days_open}</span>;
    case 'created_at':
      return <span className="tabular font-mono text-xs text-ink-muted">{row.created_at.slice(0, 10)}</span>;
    case 'incident_date':
      return (
        <span className="tabular font-mono text-xs text-ink-muted">{row.incident_date ?? '—'}</span>
      );
    default: {
      const value = (row as unknown as Record<string, unknown>)[key];
      return value ? String(value) : '—';
    }
  }
}
