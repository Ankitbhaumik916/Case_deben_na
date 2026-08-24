import Link from 'next/link';
import { NavLinks, type NavItem } from './NavLinks';
import { OrgSwitcher } from './OrgSwitcher';
import { UserMenu } from './UserMenu';
import { NotificationsButton } from './NotificationsButton';
import { can, type CurrentUser } from '@/lib/auth';

/** The brand mark. Deliberately typographic — no logo asset to maintain. */
function Wordmark() {
  return (
    <Link
      href="/portal"
      className="flex items-center gap-2 rounded text-ink-inverse transition-opacity duration-150 hover:opacity-85"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent-chrome font-mono text-xs font-bold text-chrome"
      >
        F
      </span>
      <span className="text-sm font-semibold tracking-tight">Forensibus</span>
    </Link>
  );
}

export function TopNav({ user }: { user: CurrentUser }) {
  const rank = user.activeOrg?.rank ?? 0;

  const items: NavItem[] = [
    { label: 'Portal', href: '/portal', enabled: true },
    { label: 'Cases', href: '/cases', enabled: true },
    { label: 'Pipeline', href: '/pipeline', enabled: false, note: 'Kanban board — phase 6' },
    { label: 'Reports', href: '/reports', enabled: false, note: 'Analytics — phase 12' },
    {
      label: 'Activity',
      href: '/activity-logs',
      enabled: false,
      note: 'Audit trail — phase 12',
    },
    ...(can.admin(rank)
      ? [
          {
            label: 'Admin',
            href: '/admin/case-types',
            enabled: true,
          } satisfies NavItem,
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-nav border-b border-edge-chrome bg-chrome">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Wordmark />

        <span className="mx-1 hidden h-5 w-px bg-edge-chrome sm:block" aria-hidden="true" />

        <OrgSwitcher memberships={user.memberships} activeOrgId={user.activeOrg?.orgId ?? null} />

        <span className="mx-1 hidden h-5 w-px bg-edge-chrome md:block" aria-hidden="true" />

        <NavLinks items={items} />

        <div className="ml-auto flex items-center gap-0.5">
          <NotificationsButton />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
