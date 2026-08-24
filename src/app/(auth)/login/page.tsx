import Link from 'next/link';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

/**
 * Two independent gates, both required.
 *
 * NODE_ENV is inlined by the compiler, so in any production build this folds to
 * `false` and the whole block — emails included — is dead-code eliminated rather
 * than merely hidden at runtime.
 *
 * The explicit flag then closes the one remaining hole: running `next dev` as a
 * deployment. Development mode alone is no longer enough; someone has to ask for
 * the panel. It must carry the NEXT_PUBLIC_ prefix to stay a compile-time
 * constant — a plain server-only var would be read at runtime and would cost us
 * the elimination above.
 */
const SHOW_DEMO_ACCOUNTS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === '1';

const DEMO_ACCOUNTS = [
  ['sam.okafor@northgate.test', 'Super admin'],
  ['ada.lindqvist@northgate.test', 'Administrator'],
  ['renee.adeyemi@northgate.test', 'Reviewer'],
  ['ines.vargas@northgate.test', 'Investigator'],
  ['rosa.ortiz@northgate.test', 'Read only'],
] as const;

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <main className="flex min-h-screen">
      {/* ---------- form side ---------- */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[440px] lg:shrink-0">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded bg-chrome font-mono text-sm font-bold text-accent-chrome"
            >
              F
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink">Forensibus</span>
          </div>

          <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-ink-secondary">
            Case records are access controlled and every action is logged.
          </p>

          <LoginForm next={searchParams.next} />

          <p className="mt-6 text-sm text-ink-secondary">
            Need an account?{' '}
            <Link href="/signup" className="font-medium text-accent hover:text-accent-hover">
              Create one
            </Link>
          </p>

          {SHOW_DEMO_ACCOUNTS ? (
            <div className="mt-8 rounded-lg border border-edge bg-sunken p-3">
              <p className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
                Demo accounts (development only)
              </p>
              <ul className="mt-2 space-y-1">
                {DEMO_ACCOUNTS.map(([email, role]) => (
                  <li key={email} className="flex items-baseline justify-between gap-3 text-xs">
                    <code className="truncate font-mono text-ink-secondary">{email}</code>
                    <span className="shrink-0 text-ink-muted">{role}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-muted">
                Password is whatever SEED_DEMO_PASSWORD was set to when the demo seed ran.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ---------- ink panel ---------- */}
      <div className="relative hidden flex-1 bg-chrome lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <div />
          <div className="max-w-lg">
            <p className="text-2xl font-semibold leading-snug tracking-tight text-ink-inverse">
              One engine, every discipline.
            </p>
            <p className="mt-4 text-base leading-relaxed text-ink-inverse-muted">
              Fire investigation, burglary, questioned documents — each is a template an
              administrator configures, not a release an engineer ships. Sections, fields,
              statuses, compliance checklists and report structure are all data.
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
