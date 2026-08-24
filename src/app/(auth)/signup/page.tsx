import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { SignupForm } from './SignupForm';
import { signupEnabled } from '@/lib/signup-config';
import { EmptyState } from '@/components/ui';

export const metadata = { title: 'Create account' };

// SIGNUP_ENABLED is read per request. Prerendering would bake its value in at
// build time, so flipping the switch would not change the page until a redeploy.
export const dynamic = 'force-dynamic';

export default function SignupPage() {
  const open = signupEnabled();

  return (
    <main className="flex min-h-screen">
      {/* ---------- form side ---------- */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[440px] lg:shrink-0">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded bg-chrome font-mono text-sm font-bold text-accent-chrome"
            >
              F
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink">Forensibus</span>
          </Link>

          {open ? (
            <>
              <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
              <p className="mb-6 mt-1 text-sm text-ink-secondary">
                Every action you take in a case file is attributed to you and recorded.
              </p>

              <SignupForm />

              <p className="mt-6 text-sm text-ink-secondary">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-ink">Registration is closed</h1>
              <p className="mb-6 mt-1 text-sm text-ink-secondary">
                Accounts are created by an administrator.
              </p>
              <EmptyState
                icon={ShieldAlert}
                title="Ask for an invitation"
                description="Access to case files is granted per organisation, so an administrator has to add you before you can sign in."
                action={
                  <Link
                    href="/login"
                    className="inline-flex h-9 items-center rounded bg-chrome px-3.5 text-sm font-medium text-ink-inverse hover:bg-chrome-hover"
                  >
                    Back to sign in
                  </Link>
                }
              />
            </>
          )}
        </div>
      </div>

      {/* ---------- ink panel ---------- */}
      <div className="relative hidden flex-1 bg-chrome lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <div />
          <div className="max-w-lg">
            <p className="text-2xl font-semibold leading-snug tracking-tight text-ink-inverse">
              Access is per organisation.
            </p>
            <p className="mt-4 text-base leading-relaxed text-ink-inverse-muted">
              An account by itself opens nothing. What you can read, edit and approve is
              decided by the role you hold inside an organisation, and enforced in the
              database rather than the interface.
            </p>
          </div>
          <p className="font-mono text-2xs uppercase tracking-widest text-ink-inverse-muted">
            Access controlled · Fully audited
          </p>
        </div>
      </div>
    </main>
  );
}
