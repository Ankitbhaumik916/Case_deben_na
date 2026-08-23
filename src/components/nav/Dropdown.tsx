'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Small accessible dropdown: closes on Escape, on outside click, and returns
 * focus to the trigger. Deliberately hand-rolled — the whole app needs three of
 * these, not a component library.
 */
export function Dropdown({
  trigger,
  children,
  align = 'end',
  label,
  className,
}: {
  trigger: (props: { open: boolean }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: 'start' | 'end';
  label: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="cursor-pointer rounded transition-colors duration-150"
      >
        {trigger({ open })}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-[calc(100%+0.5rem)] z-dropdown min-w-56 overflow-hidden',
            'rounded-lg border border-edge bg-raised shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children({ close })}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  active = false,
  destructive = false,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm',
        'transition-colors duration-150 hover:bg-sunken',
        active && 'bg-sunken font-medium',
        destructive ? 'text-danger' : 'text-ink',
      )}
    >
      {children}
    </button>
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-edge bg-sunken px-3 py-2 text-2xs font-medium uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );
}
