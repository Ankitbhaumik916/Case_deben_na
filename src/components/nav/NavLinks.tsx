'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  /** Routes land phase by phase; an unbuilt one renders inert rather than 404ing. */
  enabled: boolean;
  note?: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
      {items.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        if (!item.enabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title={item.note ?? 'Not built yet'}
              className="cursor-not-allowed rounded px-2.5 py-1.5 text-sm text-ink-inverse-muted opacity-45"
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded px-2.5 py-1.5 text-sm transition-colors duration-150',
              active
                ? 'bg-white/10 font-medium text-ink-inverse'
                : 'text-ink-inverse-muted hover:bg-white/5 hover:text-ink-inverse',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
