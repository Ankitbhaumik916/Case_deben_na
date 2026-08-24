'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Copy, Layers, Plus, Trash2 } from 'lucide-react';
import {
  createCaseType,
  deleteCaseType,
  duplicateCaseType,
  updateCaseType,
} from '@/lib/actions/case-types';
import { Badge, Button, EmptyState } from '@/components/ui';
import { Icon, ICON_NAMES } from '@/components/ui/icon';

export interface CaseTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  isActive: boolean;
  sectionCount: number;
  caseCount: number;
}

const SWATCHES = ['#2563eb', '#c2410c', '#7c3aed', '#16a34a', '#0891b2', '#b91c1c', '#334155'];

export function CaseTypeList({
  orgId,
  caseTypes,
}: {
  orgId: string;
  caseTypes: CaseTypeRow[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState('folder');
  const [color, setColor] = React.useState(SWATCHES[0]);

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
    <div className="space-y-4">
      {/* ---------- create ---------- */}
      {creating ? (
        <form
          className="rounded-lg border border-edge bg-raised p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createCaseType({ orgId, name, icon, color }),
              () => {
                setName('');
                setCreating(false);
              },
            );
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label htmlFor="ct-name" className="mb-1.5 block text-sm font-medium text-ink">
                Name
              </label>
              <input
                id="ct-name"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Burglary Investigation"
                className="h-9 w-full rounded border border-edge-strong bg-raised px-3 text-base text-ink placeholder:text-ink-muted"
              />
            </div>

            <div>
              <label htmlFor="ct-icon" className="mb-1.5 block text-sm font-medium text-ink">
                Icon
              </label>
              <select
                id="ct-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-9 rounded border border-edge-strong bg-raised px-2 text-base text-ink"
              >
                {ICON_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Colour</legend>
              <div className="flex h-9 items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-6 w-6 cursor-pointer rounded-full transition-transform duration-150 ${
                      color === c ? 'scale-110 ring-2 ring-ink ring-offset-2' : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                Create
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New case type
        </Button>
      )}

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {/* ---------- list ---------- */}
      {caseTypes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No case types yet"
          description="Create one to define the sections, fields and report structure a discipline uses."
        />
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-raised">
          {caseTypes.map((type) => (
            <li key={type.id} className="flex flex-wrap items-center gap-3 p-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded"
                style={{
                  backgroundColor: `color-mix(in srgb, ${type.color} 12%, transparent)`,
                  color: type.color,
                }}
              >
                <Icon name={type.icon} className="h-4.5 w-4.5" />
              </span>

              <div className="min-w-48 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/case-types/${type.id}`}
                    className="text-base font-semibold text-ink hover:text-accent"
                  >
                    {type.name}
                  </Link>
                  {!type.isActive ? <Badge>Inactive</Badge> : null}
                </div>
                <p className="tabular font-mono text-xs text-ink-muted">
                  {type.slug} · {type.sectionCount} section{type.sectionCount === 1 ? '' : 's'} ·{' '}
                  {type.caseCount} case{type.caseCount === 1 ? '' : 's'}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={type.isActive}
                    onChange={(e) =>
                      run(() => updateCaseType(type.id, { is_active: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--accent)]"
                  />
                  Active
                </label>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const copyName = window.prompt(
                      'Name for the copy — clone a type to bootstrap a new discipline, then edit it.',
                      `${type.name} (copy)`,
                    );
                    if (copyName) run(() => duplicateCaseType(type.id, copyName));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Duplicate
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Delete "${type.name}"? This cannot be undone.`)) {
                      run(() => deleteCaseType(type.id));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Delete {type.name}</span>
                </Button>

                <Link
                  href={`/admin/case-types/${type.id}`}
                  className="inline-flex h-8 items-center rounded border border-edge-strong bg-raised px-2.5 text-xs font-medium text-ink transition-colors duration-150 hover:bg-sunken"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
