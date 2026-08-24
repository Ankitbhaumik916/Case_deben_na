import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { EmptyState } from '@/components/ui';
import { PrintButton } from './PrintButton';

export const metadata = { title: 'Chain of custody' };

/**
 * The chain-of-custody document.
 *
 * Rendered as an ordinary page with print rules rather than generated as a PDF,
 * because the browser's own print-to-PDF produces a correct, selectable,
 * searchable document with no library and no server-side rendering pipeline.
 * The report engine in phase 11 will need real PDF generation for versioned
 * artefacts; a custody ledger someone prints and signs does not.
 *
 * Everything on the page comes from the ledger. Nothing is summarised or
 * recomputed here — a chain of custody that disagrees with its own source is
 * worse than no document.
 */
export default async function CustodyPrintPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user.activeOrg) {
    return <EmptyState icon={ShieldAlert} title="You are not a member of any organisation" />;
  }

  const supabase = createSupabaseServerClient();

  const [{ data: kase }, { data: evidence }, { data: custody }] = await Promise.all([
    supabase
      .from('case_list_view')
      .select('id, case_number, title, address, city, county, state, case_type_name, status_label, lead_investigator_name, created_at')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('evidence_items')
      .select(
        'id, item_number, category, description, collected_from, collected_by, collected_at, exam_requested, current_status, current_location, disposition',
      )
      .eq('case_id', params.id)
      .order('item_number'),
    supabase
      .from('custody_events')
      .select('id, evidence_id, event_type, actor_name, location, occurred_at, notes')
      .order('occurred_at'),
  ]);

  if (!kase) notFound();

  const eventsByItem = new Map<string, typeof custody>();
  for (const e of custody ?? []) {
    const key = e.evidence_id as string;
    if (!eventsByItem.has(key)) eventsByItem.set(key, []);
    eventsByItem.get(key)!.push(e);
  }

  const printedAt = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/cases/${params.id}?tab=custody`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to the case
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-5 rounded-lg border border-edge bg-raised p-6 print:rounded-none print:border-0 print:p-0">
        <header className="border-b border-edge pb-4">
          <p className="text-2xs font-medium uppercase tracking-widest text-ink-muted">
            Chain of custody
          </p>
          <h1 className="tabular mt-1 font-mono text-2xl font-semibold text-ink">
            {kase.case_number as string}
          </h1>
          {kase.title ? <p className="mt-0.5 text-sm text-ink">{kase.title as string}</p> : null}

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
            <Row label="Case type" value={kase.case_type_name as string} />
            <Row label="Status" value={(kase.status_label as string) ?? 'Not set'} />
            <Row
              label="Lead investigator"
              value={(kase.lead_investigator_name as string) ?? 'Not assigned'}
            />
            <Row
              label="Location"
              value={
                [kase.address, kase.city, kase.county, kase.state].filter(Boolean).join(', ') ||
                'Not recorded'
              }
            />
            <Row label="Case opened" value={(kase.created_at as string).slice(0, 10)} />
            <Row label="Document printed" value={printedAt.toLocaleString()} />
          </dl>
        </header>

        {(evidence ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            No evidence has been recorded against this case.
          </p>
        ) : null}

        {(evidence ?? []).map((item) => {
          const events = eventsByItem.get(item.id as string) ?? [];
          return (
            <section key={item.id as string} className="break-inside-avoid border-b border-edge pb-4 last:border-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="tabular font-mono text-base font-semibold text-ink">
                  Item {item.item_number as string}
                </h2>
                {item.category ? (
                  <span className="text-xs text-ink-muted">{item.category as string}</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-ink">{item.description as string}</p>

              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                <Row label="Collected from" value={(item.collected_from as string) ?? '—'} small />
                <Row label="Collected by" value={(item.collected_by as string) ?? '—'} small />
                <Row
                  label="Collected at"
                  value={item.collected_at ? new Date(item.collected_at as string).toLocaleString() : '—'}
                  small
                />
                <Row label="Examination" value={(item.exam_requested as string) ?? 'None requested'} small />
                <Row
                  label="Present status"
                  value={((item.current_status as string) ?? '').replace(/_/g, ' ') || '—'}
                  small
                />
                <Row label="Present location" value={(item.current_location as string) ?? '—'} small />
              </dl>

              <table className="mt-3 w-full border-collapse text-xs">
                <caption className="sr-only">Custody entries for item {item.item_number as string}</caption>
                <thead>
                  <tr className="border-y border-edge bg-sunken text-left print:bg-transparent">
                    <th scope="col" className="py-1.5 pr-3 font-medium text-ink-muted">Date and time</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium text-ink-muted">Event</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium text-ink-muted">Person</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium text-ink-muted">Location</th>
                    <th scope="col" className="py-1.5 font-medium text-ink-muted">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-2 text-danger">
                        No custody entries recorded. This is a gap in the chain.
                      </td>
                    </tr>
                  ) : null}
                  {events.map((e) => (
                    <tr key={e.id as string} className="border-b border-edge align-top">
                      <td className="tabular whitespace-nowrap py-1.5 pr-3 font-mono text-ink-secondary">
                        {new Date(e.occurred_at as string).toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 capitalize text-ink">{e.event_type as string}</td>
                      <td className="py-1.5 pr-3 text-ink-secondary">{e.actor_name as string}</td>
                      <td className="py-1.5 pr-3 text-ink-secondary">{(e.location as string) ?? '—'}</td>
                      <td className="py-1.5 text-ink-muted">{(e.notes as string) ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Somewhere for the next hand-off to be signed on paper. */}
              <div className="mt-3 hidden grid-cols-2 gap-6 print:grid">
                <SignatureLine label="Released by" />
                <SignatureLine label="Received by" />
              </div>
            </section>
          );
        })}

        <footer className="border-t border-edge pt-3 text-2xs text-ink-muted">
          Printed from Forensibus on {printedAt.toLocaleString()} by{' '}
          {user.fullName ?? user.email}. Every entry above is reproduced from the custody ledger
          held for case {kase.case_number as string}; the system records who made each entry and
          when, separately and unalterably.
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <dt className={small ? 'text-2xs text-ink-muted' : 'text-2xs uppercase tracking-wide text-ink-muted'}>
        {label}
      </dt>
      <dd className={small ? 'text-xs text-ink' : 'text-sm text-ink'}>{value}</dd>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="mt-6 border-b border-ink" />
      <p className="mt-1 text-2xs text-ink-muted">{label} — name, signature, date</p>
    </div>
  );
}
