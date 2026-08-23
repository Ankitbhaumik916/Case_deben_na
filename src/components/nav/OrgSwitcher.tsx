'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Dropdown, DropdownItem, DropdownLabel } from './Dropdown';
import { setActiveOrg } from '@/lib/actions/session';
import type { Membership } from '@/lib/auth';

export function OrgSwitcher({
  memberships,
  activeOrgId,
}: {
  memberships: Membership[];
  activeOrgId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const active = memberships.find((m) => m.orgId === activeOrgId) ?? memberships[0];

  if (!active) return null;

  // A single-org user has nothing to switch between, so show the name plainly
  // rather than a control that does nothing.
  if (memberships.length === 1) {
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-ink-inverse">
        <Building2 className="h-4 w-4 text-ink-inverse-muted" aria-hidden="true" />
        {active.orgName}
      </span>
    );
  }

  function select(orgId: string, close: () => void) {
    close();
    startTransition(async () => {
      await setActiveOrg(orgId);
      router.refresh();
    });
  }

  return (
    <Dropdown
      label="Switch organisation"
      align="start"
      trigger={({ open }) => (
        <span
          className={`flex h-9 items-center gap-2 rounded border border-edge-chrome px-2.5 text-sm font-medium text-ink-inverse transition-colors duration-150 hover:bg-white/5 ${
            open ? 'bg-white/5' : ''
          } ${pending ? 'opacity-60' : ''}`}
        >
          <Building2 className="h-4 w-4 text-ink-inverse-muted" aria-hidden="true" />
          {active.orgName}
          <ChevronsUpDown className="h-3.5 w-3.5 text-ink-inverse-muted" aria-hidden="true" />
        </span>
      )}
    >
      {({ close }) => (
        <>
          <DropdownLabel>Organisations</DropdownLabel>
          {memberships.map((m) => (
            <DropdownItem
              key={m.orgId}
              active={m.orgId === active.orgId}
              onSelect={() => select(m.orgId, close)}
            >
              <span className="flex-1 truncate">{m.orgName}</span>
              {m.orgId === active.orgId ? (
                <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              ) : null}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
