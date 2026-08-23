'use client';

import * as React from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Dropdown, DropdownItem, DropdownLabel } from './Dropdown';
import { Avatar, RoleBadge } from '@/components/ui';
import { signOut } from '@/lib/actions/session';
import type { CurrentUser } from '@/lib/auth';

export function UserMenu({ user }: { user: CurrentUser }) {
  const [pending, startTransition] = React.useTransition();
  const roles = user.activeOrg?.roles ?? [];

  return (
    <Dropdown
      label="Account menu"
      trigger={({ open }) => (
        <span
          className={`flex h-11 w-11 items-center justify-center rounded transition-colors duration-150 hover:bg-white/5 ${
            open ? 'bg-white/5' : ''
          }`}
        >
          <Avatar name={user.fullName} email={user.email} src={user.avatarUrl} />
        </span>
      )}
    >
      {({ close }) => (
        <>
          <div className="border-b border-edge px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{user.fullName ?? user.email}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            {user.jobTitle ? (
              <p className="mt-0.5 truncate text-xs text-ink-muted">{user.jobTitle}</p>
            ) : null}
            {roles.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {roles.map((role) => (
                  <RoleBadge key={role} role={role} />
                ))}
              </div>
            ) : null}
          </div>

          <DropdownLabel>Account</DropdownLabel>
          <DropdownItem onSelect={close}>
            <UserIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            Profile settings
            <span className="ml-auto text-2xs text-ink-muted">soon</span>
          </DropdownItem>
          <DropdownItem
            destructive
            onSelect={() => {
              close();
              startTransition(() => {
                void signOut();
              });
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {pending ? 'Signing out…' : 'Sign out'}
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
