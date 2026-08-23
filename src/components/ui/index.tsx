import * as React from 'react';
import { cn, initials } from '@/lib/utils';
import { ROLE_LABEL, type RoleName } from '@/lib/roles';

/* ---------------------------------------------------------------- Button --- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-chrome text-ink-inverse hover:bg-chrome-hover border border-transparent',
  secondary:
    'bg-raised text-ink border border-edge-strong hover:bg-sunken hover:border-edge-strong',
  ghost: 'bg-transparent text-ink-secondary hover:bg-sunken hover:text-ink border border-transparent',
  danger: 'bg-danger text-ink-inverse hover:brightness-110 border border-transparent',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-4 text-base gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and swaps the label for a spinner. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // A disabled button must not also say cursor-pointer.
      className={cn(
        'inline-flex items-center justify-center rounded font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        !disabled && !loading && 'cursor-pointer',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
});

/* --------------------------------------------------------------- Spinner --- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------- Badge --- */

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'inverse';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide',
        tone === 'neutral' && 'border-edge bg-sunken text-ink-secondary',
        tone === 'accent' && 'border-transparent bg-accent-subtle text-accent',
        tone === 'inverse' && 'border-edge-chrome bg-white/5 text-ink-inverse-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RoleBadge({ role, tone }: { role: RoleName; tone?: 'neutral' | 'inverse' }) {
  return <Badge tone={tone ?? 'neutral'}>{ROLE_LABEL[role]}</Badge>;
}

/* ---------------------------------------------------------------- Avatar --- */

export function Avatar({
  name,
  email,
  src,
  size = 'md',
  className,
}: {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const label = initials(name ?? email, email ?? '?');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full',
        'bg-accent-subtle font-medium text-accent',
        size === 'sm' ? 'h-6 w-6 text-2xs' : 'h-8 w-8 text-xs',
        className,
      )}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        label
      )}
    </span>
  );
}

/* ------------------------------------------------------------ EmptyState --- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-edge-strong bg-sunken px-6 py-14 text-center">
      {Icon ? <Icon className="mb-3 h-6 w-6 text-ink-muted" /> : null}
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-prose text-sm text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
