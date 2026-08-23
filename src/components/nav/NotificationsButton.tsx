'use client';

import { Bell } from 'lucide-react';
import { Dropdown } from './Dropdown';

/**
 * Stub, per the phase 2 spec. The bell is wired to nothing until there is
 * something to notify about; it does not pretend to have unread state.
 */
export function NotificationsButton() {
  return (
    <Dropdown
      label="Notifications"
      trigger={({ open }) => (
        <span
          className={`flex h-11 w-11 items-center justify-center rounded transition-colors duration-150 hover:bg-white/5 ${
            open ? 'bg-white/5' : ''
          }`}
        >
          <Bell className="h-4.5 w-4.5 text-ink-inverse-muted" aria-hidden="true" />
        </span>
      )}
    >
      {() => (
        <div className="px-3 py-6 text-center">
          <p className="text-sm font-medium text-ink">No notifications</p>
          <p className="mt-1 text-xs text-ink-muted">
            Case assignments and review requests will appear here.
          </p>
        </div>
      )}
    </Dropdown>
  );
}
