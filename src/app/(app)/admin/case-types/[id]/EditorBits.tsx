'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

/** Shared plumbing for the builder tabs: run an action, surface its message, refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
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
    },
    [router],
  );

  return { run, pending, error, clearError: () => setError(null) };
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

export function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 enabled:cursor-pointer"
    >
      {children}
    </button>
  );
}

export const STATUS_SWATCHES = [
  '#6b7280',
  '#2563eb',
  '#7c3aed',
  '#9333ea',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#334155',
];
