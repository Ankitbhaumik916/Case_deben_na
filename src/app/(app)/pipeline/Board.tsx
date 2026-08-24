'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, MessageSquare, MoveRight } from 'lucide-react';
import { moveCase } from '@/lib/actions/pipeline';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import type { CaseRow } from '../cases/types';
import { NotesPanel } from './NotesPanel';

export interface Column {
  id: string;
  key: string;
  label: string;
  color: string;
  requiresReview: boolean;
}

/**
 * The pipeline board.
 *
 * Drag works for pointer users through the native HTML5 API — no dependency,
 * and it is what people expect of a kanban. But a canvas of drag targets is
 * unusable with a keyboard or a screen reader, so every card also carries a
 * "Move to" select that does exactly the same thing. Both paths call the same
 * action; neither is a second-class citizen.
 *
 * Moves are optimistic. When the database refuses one — moving into an
 * approval column without the reviewer role is the common case — the card
 * goes back where it came from and the reason is shown.
 */
export function Board({
  columns,
  cases,
  canWrite,
  currentUserId,
  isAdmin,
}: {
  columns: Column[];
  cases: CaseRow[];
  canWrite: boolean;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState(cases);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notesFor, setNotesFor] = React.useState<CaseRow | null>(null);

  React.useEffect(() => setRows(cases), [cases]);

  const byColumn = React.useMemo(() => {
    const map = new Map<string, CaseRow[]>(columns.map((c) => [c.key, []]));
    for (const row of rows) {
      const key = row.status_key ?? '';
      if (map.has(key)) map.get(key)!.push(row);
    }
    return map;
  }, [rows, columns]);

  const unplaced = rows.filter((r) => !r.status_key || !byColumn.has(r.status_key));

  async function move(caseId: string, column: Column) {
    const row = rows.find((r) => r.id === caseId);
    if (!row || row.status_key === column.key) return;

    const previous = rows;
    setError(null);
    // Optimistic: the card lands where it was dropped, immediately.
    setRows((prev) =>
      prev.map((r) =>
        r.id === caseId
          ? { ...r, status_key: column.key, status_label: column.label, status_color: column.color }
          : r,
      ),
    );

    const result = await moveCase({ caseId, statusId: column.id });
    if (!result.ok) {
      setRows(previous);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {unplaced.length > 0 ? (
        <p className="rounded border border-edge bg-sunken px-3 py-2 text-sm text-ink-secondary">
          {unplaced.length} case{unplaced.length === 1 ? '' : 's'} sit
          {unplaced.length === 1 ? 's' : ''} in a status outside this pipeline — most likely a case
          type with its own. Filter by that type to see them rather than losing track of them.
        </p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => {
          const items = byColumn.get(column.key) ?? [];
          return (
            <section
              key={column.id}
              aria-label={`${column.label}, ${items.length} case${items.length === 1 ? '' : 's'}`}
              onDragOver={(e) => {
                if (!canWrite || !dragging) return;
                e.preventDefault();
                setOver(column.key);
              }}
              onDragLeave={() => setOver((k) => (k === column.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) void move(dragging, column);
                setDragging(null);
              }}
              className={cn(
                'flex w-72 shrink-0 flex-col rounded-lg border bg-sunken transition-colors duration-150',
                over === column.key ? 'border-accent bg-accent-subtle' : 'border-edge',
              )}
            >
              <header className="flex items-center gap-2 border-b border-edge px-3 py-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {column.label}
                </h2>
                {column.requiresReview ? (
                  <span
                    title="Only a reviewer can move a case into this column"
                    className="rounded-sm border border-edge bg-raised px-1 py-0.5 text-2xs text-ink-muted"
                  >
                    reviewer
                  </span>
                ) : null}
                <span className="tabular shrink-0 font-mono text-xs text-ink-muted">
                  {items.length}
                </span>
              </header>

              <div className="flex-1 space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-ink-muted">Nothing here</p>
                ) : null}

                {items.map((row) => (
                  <article
                    key={row.id}
                    draggable={canWrite}
                    onDragStart={() => setDragging(row.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      'rounded-lg border border-edge bg-raised p-2.5 shadow-sm',
                      canWrite && 'cursor-grab active:cursor-grabbing',
                      dragging === row.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Link
                        href={`/cases/${row.id}`}
                        className="tabular min-w-0 flex-1 font-mono text-xs font-medium text-ink hover:text-accent"
                      >
                        {row.case_number}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setNotesFor(row)}
                        aria-label={`Notes on ${row.case_number}`}
                        title="Admin notes"
                        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-muted hover:bg-sunken hover:text-ink"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    {row.address ? (
                      <p className="mt-0.5 truncate text-xs text-ink-secondary">{row.address}</p>
                    ) : null}

                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <span style={{ color: row.case_type_color }}>
                          <Icon name={row.case_type_icon} className="h-3 w-3" />
                        </span>
                        {row.case_type_name}
                      </span>
                      {row.county ? <span>· {row.county}</span> : null}
                      <span className="tabular">· {row.days_open}d open</span>
                    </p>

                    {row.lead_investigator_name || row.created_by_name ? (
                      <p className="mt-1 truncate text-2xs text-ink-muted">
                        {row.lead_investigator_name ?? row.created_by_name}
                      </p>
                    ) : null}

                    {canWrite ? (
                      <label className="mt-2 flex items-center gap-1.5 border-t border-edge pt-2">
                        <MoveRight className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
                        <span className="sr-only">Move {row.case_number} to</span>
                        <select
                          value={row.status_key ?? ''}
                          onChange={(e) => {
                            const target = columns.find((c) => c.key === e.target.value);
                            if (target) void move(row.id, target);
                          }}
                          className="h-6 w-full cursor-pointer rounded border border-edge bg-raised px-1 text-2xs text-ink-secondary"
                        >
                          {columns.map((c) => (
                            <option key={c.id} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {notesFor ? (
        <NotesPanel
          caseRow={notesFor}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          canWrite={canWrite}
          onClose={() => setNotesFor(null)}
        />
      ) : null}
    </div>
  );
}
