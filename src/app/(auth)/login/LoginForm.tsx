'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';

/**
 * Only same-origin relative paths are honoured, so a crafted
 * ?next=https://evil.example link cannot turn the login page into an open
 * redirect.
 */
const APP_HOME = '/portal';

function safeNext(next: string | undefined): string {
  if (!next) return APP_HOME;
  // '/' is the marketing page, not the app — never land a fresh sign-in there.
  if (!next.startsWith('/') || next.startsWith('//') || next === '/') return APP_HOME;
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Deliberately does not distinguish "no such account" from "wrong
      // password" — that difference is an account-enumeration oracle.
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'That email and password do not match an account.'
          : signInError.message,
      );
      setSubmitting(false);
      return;
    }

    router.replace(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'signin-error' : undefined}
          /* 16px keeps iOS from zooming the viewport on focus. */
          className="h-11 w-full rounded border border-edge-strong bg-raised px-3 text-lg text-ink placeholder:text-ink-muted"
          placeholder="you@agency.gov"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'signin-error' : undefined}
          className="h-11 w-full rounded border border-edge-strong bg-raised px-3 text-lg text-ink"
        />
      </div>

      {error ? (
        <p
          id="signin-error"
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
