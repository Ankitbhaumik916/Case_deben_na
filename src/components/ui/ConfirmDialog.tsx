'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * A deliberate yes to something that cannot be undone.
 *
 * Used where a template change would destroy work recorded on real cases. The
 * count is the whole point: "delete this field?" is a question nobody reads,
 * "delete this field and the 47 answers recorded against it?" is a different
 * question. So the number goes in the heading, not buried in a sentence.
 *
 * Native confirm() would do the job for a one-line question and is still used
 * for those. It cannot show a count, a consequence and the name of the thing
 * separately, which is exactly what makes this warning worth stopping for.
 */
export function ConfirmDialog({
  open,
  title,
  count,
  consequence,
  confirmLabel = 'Delete anyway',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  count?: number;
  consequence: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    // Focus lands on the destructive button, but Escape and Cancel are both a
    // single key or click away — the dialog should be easy to leave.
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-overlay flex items-center justify-center p-4"
      style={{ backgroundColor: 'color-mix(in srgb, var(--surface-chrome) 55%, transparent)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-lg border border-edge bg-raised p-4 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-ink">
              {title}
            </h2>
            {typeof count === 'number' && count > 0 ? (
              <p className="tabular mt-1 font-mono text-sm font-semibold text-danger">
                {count} record{count === 1 ? '' : 's'} affected
              </p>
            ) : null}
            <p id="confirm-body" className="mt-1.5 text-sm text-ink-secondary">
              {consequence}
            </p>
            <p className="mt-2 text-xs text-ink-muted">This cannot be undone.</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={confirmRef} variant="danger" size="sm" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hook -- */

interface Warning {
  count: number;
  consequence: string;
}

type Attempt = (confirmed: boolean) => Promise<{
  ok: boolean;
  error?: string;
  warning?: Warning;
}>;

/**
 * Deleting part of a template, in two steps.
 *
 * The first dialog is an ordinary "are you sure" — nothing in a template should
 * go on a single misplaced click. Saying yes runs the delete *unconfirmed*,
 * which is the server's chance to answer "this would destroy 47 answers" rather
 * than silently doing it. Only then does the second, sterner dialog appear,
 * with the real number on it.
 *
 * The count has to come from the server, so it cannot be shown before the first
 * yes. Two dialogs for a destructive delete and one for a harmless one is the
 * right trade: the second only appears when there is genuinely something to
 * lose.
 */
export function useDestructiveDelete({
  onError,
  onDone,
}: {
  onError: (message: string) => void;
  onDone?: () => void;
}) {
  const [state, setState] = React.useState<{
    title: string;
    consequence: string;
    count?: number;
    confirmLabel: string;
    attempt: Attempt;
    confirmed: boolean;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const request = React.useCallback(
    (input: { title: string; consequence: string; attempt: Attempt }) => {
      onError('');
      setState({
        title: input.title,
        consequence: input.consequence,
        confirmLabel: 'Delete',
        attempt: input.attempt,
        confirmed: false,
      });
    },
    [onError],
  );

  const cancel = React.useCallback(() => setState(null), []);

  const confirm = React.useCallback(async () => {
    if (!state) return;
    setBusy(true);
    const result = await state.attempt(state.confirmed);
    setBusy(false);

    if (result.ok) {
      setState(null);
      onDone?.();
      return;
    }

    // The server says something real would go with it. Ask again, with the
    // number, rather than either refusing or proceeding.
    if (result.warning && !state.confirmed) {
      setState({
        ...state,
        title: result.error ?? state.title,
        consequence: result.warning.consequence,
        count: result.warning.count,
        confirmLabel: 'Delete anyway',
        confirmed: true,
      });
      return;
    }

    setState(null);
    onError(result.error ?? 'That did not work.');
  }, [state, onDone, onError]);

  return {
    request,
    dialog: (
      <ConfirmDialog
        open={state !== null}
        title={state?.title ?? ''}
        count={state?.count}
        consequence={state?.consequence ?? ''}
        confirmLabel={state?.confirmLabel}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={cancel}
      />
    ),
  };
}
