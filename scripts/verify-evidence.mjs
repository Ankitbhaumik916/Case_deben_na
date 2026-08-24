/**
 * Phase 7: evidence items and the custody ledger.
 *
 *   npm run verify:evidence
 *
 * The interesting property here is that the item's headline status can never
 * disagree with its ledger, because a trigger derives it. That is checked
 * directly rather than assumed.
 */
import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const BASE = arg('base') || process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100';
const ENV_FILE = arg('env') || '.env.local';

const env = {};
for (const l of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PW = env.SEED_DEMO_PASSWORD || 'forensibus-demo-1234';

let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};

async function cookieFor(email) {
  const jar = new Map();
  const c = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach((x) => jar.set(x.name, x.value)),
    },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
}

const get = async (path, cookie) => {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const raw = r.status < 300 ? await r.text() : '';
  return {
    status: r.status,
    body: raw
      .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, '')
      .replace(/<!--\s*-->/g, ''),
  };
};

async function asUser(email) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\nTARGET  ${BASE}`);
console.log(`AUTH    ${env.NEXT_PUBLIC_SUPABASE_URL}  (${ENV_FILE})`);

const invCookie = await cookieFor('ines.vargas@northgate.test');
const roCookie = await cookieFor('rosa.ortiz@northgate.test');
const inv = await asUser('ines.vargas@northgate.test');
const ro = await asUser('rosa.ortiz@northgate.test');

const { data: kase } = await svc
  .from('cases')
  .select('id, org_id, case_number')
  .eq('case_number', 'NG-2026-0101')
  .single();

console.log('\nPREFLIGHT');
const tab = await get(`/cases/${kase.id}?tab=custody`, invCookie);
if (tab.status !== 200 || !/Evidence and chain of custody/.test(tab.body)) {
  console.log(`  FAIL  the custody tab did not render (status ${tab.status})`);
  console.log('        Either the server is on an older build, or the page failed.');
  process.exit(1);
}
check(true, 'the custody tab rendered');

console.log('\nTHE TAB');
check(/Chain of custody/.test(tab.body), 'the case page offers a chain-of-custody tab');
check(/Add item/.test(tab.body), 'an investigator can add an item');
check(/Preview & print|Preview &amp; print/.test(tab.body), 'and reach the printable document');

console.log('\nRECORDING AN ITEM OPENS ITS LEDGER');
let itemId = null;
const { data: item, error: itemErr } = await inv
  .from('evidence_items')
  .insert({
    org_id: kase.org_id,
    case_id: kase.id,
    item_number: 'PROBE-1',
    description: 'Probe item, brass padlock',
    category: 'Physical',
    collected_from: 'North loading door',
    collected_by: 'Ines Vargas',
  })
  .select('id, current_status, current_location')
  .single();
check(!itemErr, 'an investigator records an item', itemErr?.message ?? '');
itemId = item.id;

const { error: firstErr } = await inv.from('custody_events').insert({
  org_id: kase.org_id,
  evidence_id: itemId,
  event_type: 'collected',
  actor_name: 'Ines Vargas',
  location: 'North loading door',
  occurred_at: new Date(Date.now() - 172800000).toISOString(),
});
check(!firstErr, 'and opens the ledger with the collection', firstErr?.message ?? '');

console.log('\nTHE HEADLINE IS DERIVED, NOT STORED SEPARATELY');
const { data: afterCollect } = await svc
  .from('evidence_items')
  .select('current_status, current_location')
  .eq('id', itemId)
  .single();
check(
  afterCollect.current_status === 'collected',
  'the item reports the ledger entry, not a field someone typed',
  `${afterCollect.current_status} @ ${afterCollect.current_location}`,
);

await inv.from('custody_events').insert({
  org_id: kase.org_id,
  evidence_id: itemId,
  event_type: 'transferred',
  actor_name: 'Regional Laboratory intake',
  location: 'Regional Laboratory, Evidence Receiving',
  occurred_at: new Date(Date.now() - 86400000).toISOString(),
  notes: 'Sealed, seal 44192.',
});

const { data: afterTransfer } = await svc
  .from('evidence_items')
  .select('current_status, current_location')
  .eq('id', itemId)
  .single();
check(
  afterTransfer.current_status === 'transferred' &&
    /Regional Laboratory/.test(afterTransfer.current_location ?? ''),
  'a later hand-off moves the headline with it',
  `${afterTransfer.current_status} @ ${afterTransfer.current_location}`,
);

// The ordering that matters is when it happened, not when it was typed.
await inv.from('custody_events').insert({
  org_id: kase.org_id,
  evidence_id: itemId,
  event_type: 'received',
  actor_name: 'Backdated entry',
  location: 'Somewhere earlier',
  occurred_at: new Date(Date.now() - 259200000).toISOString(),
});
const { data: afterBackdate } = await svc
  .from('evidence_items')
  .select('current_status')
  .eq('id', itemId)
  .single();
check(
  afterBackdate.current_status === 'transferred',
  'a backdated entry does not become the present state',
  afterBackdate.current_status,
);

console.log('\nDESTROYING A CHAIN');
const { count: eventCount } = await svc
  .from('custody_events')
  .select('id', { count: 'exact', head: true })
  .eq('evidence_id', itemId);
check(eventCount === 3, 'the item carries a real chain', `${eventCount} entries`);

/*
 * NOT COVERED, stated rather than quietly skipped.
 *
 * deleteEvidence() refuses to remove an item carrying more than its opening
 * entry, because that would destroy the record of who held what. That guard
 * lives in the server action, not the database, so the direct PostgREST calls
 * this suite makes go straight past it — which also means the suite cannot
 * exercise it without invoking the action over HTTP.
 *
 * It is app-level on purpose: a BEFORE DELETE trigger would also fire when a
 * case cascades to its evidence, and would then make deleting a case
 * impossible — the exact failure fixed in migration 0015. Worth revisiting if
 * the rule ever needs to hold against direct API access, which today it
 * does not.
 */
console.log('  SKIP  the delete guard is app-level — see the note in this file');

console.log('\nREAD-ONLY ACCOUNTS');
const { error: roItemErr } = await ro.from('evidence_items').insert({
  org_id: kase.org_id,
  case_id: kase.id,
  item_number: 'PROBE-RO',
  description: 'Should not exist',
});
check(!!roItemErr, 'cannot record evidence', roItemErr?.code ?? 'NO ERROR');

const { error: roEventErr } = await ro.from('custody_events').insert({
  org_id: kase.org_id,
  evidence_id: itemId,
  event_type: 'released',
  actor_name: 'Should not exist',
  occurred_at: new Date().toISOString(),
});
check(!!roEventErr, 'and cannot add a custody entry', roEventErr?.code ?? 'NO ERROR');

const roTab = await get(`/cases/${kase.id}?tab=custody`, roCookie);
check(roTab.status === 200 && !/Add item/.test(roTab.body), 'and is offered no controls');

console.log('\nTHE PRINTABLE DOCUMENT');
const doc = await get(`/cases/${kase.id}/custody`, invCookie);
check(doc.status === 200, 'renders', String(doc.status));
check(/Chain of custody/.test(doc.body), 'is titled as one');
check(/PROBE-1/.test(doc.body), 'lists the item');
check(/Regional Laboratory/.test(doc.body), 'and every ledger entry');
check(/Released by/.test(doc.body) && /Received by/.test(doc.body), 'with signature lines for the next hand-off');
check(/reproduced from the custody ledger/.test(doc.body), 'and says where its contents came from');

console.log('\nAUDIT');
const { data: logs } = await svc
  .from('activity_logs')
  .select('action')
  .eq('case_id', kase.id)
  .in('target_type', ['evidence', 'custody_event']);
check(
  (logs ?? []).some((l) => l.action === 'evidence.created') &&
    (logs ?? []).some((l) => l.action === 'custody_event.created'),
  'both the item and its entries reached the audit trail',
  [...new Set((logs ?? []).map((l) => l.action))].join(', '),
);

console.log('\nCLEANUP');
await svc.from('evidence_items').delete().eq('id', itemId);
const { count: left } = await svc
  .from('evidence_items')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id)
  .like('item_number', 'PROBE%');
check(left === 0, 'probe evidence removed', String(left));

console.log('\n' + (fail === 0 ? 'EVIDENCE: all checks passed' : `EVIDENCE: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
