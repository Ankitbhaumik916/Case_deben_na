'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ClipboardCheck } from 'lucide-react';
import { setChecklistResponse } from '@/lib/actions/checklist';
import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * The compliance checklist as an investigator sees it: answer the checks, and
 * nothing else. There is no add, rename, reorder or delete anywhere on this
 * screen — those live in the builder, behind an administrator, because a
 * checklist you can edit while answering it is not evidence of compliance.
 */

export interface ChecklistItem {
  id: string;
  label: string;
  helpText: string | null;
  sectionRef: string | null;
  isRequired: boolean;
  checked: boolean;
  completedByName: string | null;
  completedAt: string | null;
}

export interface Checklist {
  id: string;
  name: string;
  sourceStandard: string | null;
  version: string | null;
  items: ChecklistItem[];
}

export function ChecklistPanel({
  caseId,
  checklists,
  canWrite,
}: {
  caseId: string;
  checklists: Checklist[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // Optimistic: a checkbox that waits for a round trip before moving feels
  // broken. The server is still the authority — a refusal puts it back.
  const [local, setLocal] = React.useState<Record<string, boolean>>({});

  const isChecked = (item: ChecklistItem) => local[item.id] ?? item.checked;

  const allItems = checklists.flatMap((c) => c.items);
  const done = allItems.filter(isChecked).length;
  const requiredOutstanding = allItems.filter((i) => i.isRequired && !isChecked(i)).length;

  async function toggle(item: ChecklistItem, next: boolean) {
    if (!canWrite) return;
    setError(null);
    setBusy(item.id);
    setLocal((m) => ({ ...m, [item.id]: next }));

    const result = await setChecklistResponse({ caseId, itemId: item.id, checked: next });
    setBusy(null);

    if (!result.ok) {
      setLocal((m) => ({ ...m, [item.id]: !next }));
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (checklists.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No compliance checklist on this case type"
        description="An administrator attaches one in Admin → Case Types. It appears here the moment they do, with no deploy."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Compliance</h2>
          <p className="text-xs text-ink-muted">
            {done} of {allItems.length} complete
            {requiredOutstanding > 0
              ? ` · ${requiredOutstanding} required check${requiredOutstanding === 1 ? '' : 's'} outstanding`
              : allItems.length > 0
                ? ' · every required check done'
                : ''}
          </p>
        </div>
        {!canWrite ? (
          <span className="text-xs text-ink-muted">Read-only — checks cannot be ticked.</span>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {checklists.map((list) => {
        const listDone = list.items.filter(isChecked).length;
        return (
          <section key={list.id} className="overflow-hidden rounded-lg border border-edge bg-raised">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge bg-sunken px-3 py-2.5">
              <div>
                <h3 className="text-sm font-semibold text-ink">{list.name}</h3>
                <p className="text-2xs text-ink-muted">
                  {[list.sourceStandard, list.version].filter(Boolean).join(' · ') ||
                    'No standard recorded'}
                </p>
              </div>
              <span className="tabular font-mono text-xs text-ink-secondary">
                {listDone}/{list.items.length}
              </span>
            </header>

            <ul>
              {list.items.map((item) => {
                const on = isChecked(item);
                return (
                  <li key={item.id} className="border-b border-edge last:border-0">
                    <label
                      className={cn(
                        'flex items-start gap-2.5 px-3 py-2.5',
                        canWrite ? 'cursor-pointer hover:bg-sunken' : 'cursor-default',
                        busy === item.id && 'opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!canWrite || busy === item.id}
                        onChange={(e) => void toggle(item, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--accent)] disabled:cursor-not-allowed"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-sm',
                            on ? 'text-ink-muted line-through' : 'text-ink',
                          )}
                        >
                          {item.label}
                          {item.isRequired ? (
                            <span className="ml-1 text-danger" aria-label="required">
                              *
                            </span>
                          ) : null}
                        </span>
                        {item.helpText ? (
                          <span className="mt-0.5 block text-xs text-ink-secondary">
                            {item.helpText}
                          </span>
                        ) : null}
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {item.sectionRef ? (
                            <span className="font-mono text-2xs text-ink-muted">
                              {item.sectionRef}
                            </span>
                          ) : null}
                          {on && item.completedAt ? (
                            <span className="text-2xs text-ink-muted">
                              {item.completedByName ?? 'Someone'} ·{' '}
                              {new Date(item.completedAt).toLocaleString()}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {list.items.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-ink-muted">
                  This checklist has no checks yet.
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
