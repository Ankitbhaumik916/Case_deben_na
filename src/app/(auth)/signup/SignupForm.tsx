'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { signUp } from '@/lib/actions/signup';
import { Button } from '@/components/ui';

const APP_HOME = '/portal';

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    // Provisioning runs on the server: it needs the service role to grant a
    // role, and that key must never reach the browser.
    const result = await signUp({ fullName, email, password });

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    // Then sign in from the browser so @supabase/ssr writes the session cookie
    // the same way it does on the login page.
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: result.email,
      password,
    });

    if (signInError) {
      setError('Account created, but sign-in failed. Try signing in directly.');
      setSubmitting(false);
      return;
    }

    router.replace(APP_HOME);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-ink">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-describedby={error ? 'signup-error' : undefined}
          className="h-11 w-full rounded border border-edge-strong bg-raised px-3 text-lg text-ink placeholder:text-ink-muted"
          placeholder="Jo Mensah"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? 'signup-error' : undefined}
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
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? 'signup-error password-hint' : 'password-hint'}
          className="h-11 w-full rounded border border-edge-strong bg-raised px-3 text-lg text-ink"
        />
        <p id="password-hint" className="mt-1.5 text-xs text-ink-muted">
          At least 10 characters.
        </p>
      </div>

      {error ? (
        <p
          id="signup-error"
          role="alert"
          className="flex items-start gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
