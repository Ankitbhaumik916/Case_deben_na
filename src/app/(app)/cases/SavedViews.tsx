'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Lock, Plus, Trash2, X } from 'lucide-react';
import { createSavedView, deleteSavedView } from '@/lib/actions/saved-views';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface SavedViewRow {
  id: string;
  name: string;
  filters: Record<string, string>;
  columns: string[];
  viewMode: string;
  isShared: boolean;
  isLocked: boolean;
  isMine: boolean;
}

/** A saved view is just a query string; rebuild one so the link is shareable. */
function hrefFor(view: SavedViewRow): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(view.filters ?? {})) {
    if (value) params.set(key, value);
  }
  if (view.viewMode && view.viewMode !== 'list') params.set('view', view.viewMode);
  if (view.columns?.length) params.set('cols', view.columns.join(','));
  params.set('savedView', view.id);
  return `/cases?${params.toString()}`;
}

export function SavedViews({
  orgId,
  views,
  currentFilters,
  currentColumns,
  activeViewId,
  canShare,
}: {
  orgId: string;
  views: SavedViewRow[];
  currentFilters: Record<string, string>;
  currentColumns: string[];
  activeViewId?: string;
  canShare: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');
  const [shared, setShared] = React.useState(false);

  const hasFilters = Object.values(currentFilters).some(Boolean);
  const shareable = views.filter((v) => v.isShared);
  const personal = views.filter((v) => !v.isShared);

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
    <aside className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-medium uppercase tracking-wide text-ink-muted">Saved views</h2>
        {hasFilters && !saving ? (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Save these
          </button>
        ) : null}
      </div>

      {saving ? (
        <form
          className="space-y-2 rounded-lg border border-edge bg-raised p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createSavedView({
                  orgId,
                  name,
                  filters: currentFilters,
                  columns: currentColumns,
                  shared,
                }),
              () => {
                setName('');
                setShared(false);
                setSaving(false);
              },
            );
          }}
        >
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Open fire cases, Marion"
            aria-label="View name"
            className="h-8 w-full rounded border border-edge-strong bg-raised px-2.5 text-sm text-ink placeholder:text-ink-muted"
          />

          {canShare ? (
            <label className="flex cursor-pointer items-start gap-1.5 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
              />
              <span>
                Share with the organisation
                <span className="block text-2xs text-ink-muted">
                  Everyone sees it; only admins can change it.
                </span>
              </span>
            </label>
          ) : null}

          <div className="flex gap-1.5">
            <Button type="submit" size="sm" loading={pending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="rounded border border-danger bg-danger-subtle px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {views.length === 0 && !saving ? (
        <p className="rounded-lg border border-dashed border-edge-strong px-2.5 py-3 text-xs text-ink-muted">
          Filter the list, then save it here to come back to it.
        </p>
      ) : null}

      {shareable.length > 0 ? (
        <Group
          title="Shared"
          views={shareable}
          activeViewId={activeViewId}
          pending={pending}
          onDelete={(id) => run(() => deleteSavedView(id))}
        />
      ) : null}

      {personal.length > 0 ? (
        <Group
          title="Mine"
          views={personal}
          activeViewId={activeViewId}
          pending={pending}
          onDelete={(id) => run(() => deleteSavedView(id))}
        />
      ) : null}

      {activeViewId ? (
        <Link
          href="/cases"
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Leave this view
        </Link>
      ) : null}
    </aside>
  );
}

function Group({
  title,
  views,
  activeViewId,
  pending,
  onDelete,
}: {
  title: string;
  views: SavedViewRow[];
  activeViewId?: string;
  pending: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 px-0.5 text-2xs text-ink-muted">{title}</p>
      <ul className="overflow-hidden rounded-lg border border-edge bg-raised">
        {views.map((view) => (
          <li
            key={view.id}
            className={cn(
              'flex items-center gap-1 border-b border-edge last:border-0',
              activeViewId === view.id && 'bg-sunken',
            )}
          >
            <Link
              href={hrefFor(view)}
              aria-current={activeViewId === view.id ? 'true' : undefined}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-sm text-ink-secondary hover:text-ink"
            >
              {view.isLocked ? (
                <Lock className="h-3 w-3 shrink-0 text-ink-muted" aria-label="Locked" />
              ) : (
                <Bookmark className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
              )}
              <span className="truncate">{view.name}</span>
            </Link>
            <button
              type="button"
              onClick={() => onDelete(view.id)}
              disabled={pending}
              aria-label={`Remove ${view.name}`}
              title={view.isLocked ? 'Locked — admins only' : `Remove ${view.name}`}
              className="mr-1 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-muted hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
