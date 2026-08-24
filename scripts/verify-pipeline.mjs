/**
 * Phase 6: the pipeline board and admin notes.
 *
 *   npm run verify:pipeline
 *
 * Exercises the same paths the board does — moving a case between columns, and
 * the note rules — then puts everything back.
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
  const visible = raw
    .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, '')
    .replace(/<!--\s*-->/g, '');
  return { status: r.status, body: visible };
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
const rev = await asUser('renee.adeyemi@northgate.test');
const ro = await asUser('rosa.ortiz@northgate.test');

/*
 * A preflight is only worth having if it fails when the page does.
 *
 * The first version matched /Pipeline/, which is also the nav link, so it would
 * pass on any app page including a half-rendered one. A run once reported five
 * content failures here that would not reproduce across four later runs,
 * including a deliberate cold start — and the server log had been discarded, so
 * there was nothing left to diagnose. This matches text that exists only when
 * the board itself rendered, so a recurrence stops at one clear failure rather
 * than five confusing ones.
 */
console.log('\nPREFLIGHT');
const board = await get('/pipeline', invCookie);
const rendered = /organisation-wide pipeline/.test(board.body) && /Move to/.test(board.body);
if (board.status !== 200 || !rendered) {
  console.log(
    `  FAIL  /pipeline did not render its board (status ${board.status}, ${board.body.length} bytes)`,
  );
  console.log('        Either the server is on an older build, or the page failed to render.');
  console.log('        Read the server log before assuming the assertions below are wrong.');
  process.exit(1);
}
check(true, 'the board rendered, so the checks below mean something');

console.log('\nTHE BOARD IS BUILT FROM CONFIGURED STATUSES');
check(/organisation-wide pipeline/.test(board.body), 'defaults to the org-wide pipeline');
check(/1st Review/.test(board.body) && /Approved/.test(board.body), 'draws its columns');
check(/NG-2026-0101/.test(board.body), 'places cases on it');
check(/reviewer/.test(board.body), 'marks columns that need a reviewer');
check(/Move to/.test(board.body), 'every card has a keyboard-reachable move control');

const fireBoard = await get('/pipeline?type=fire-investigation', invCookie);
check(/Fire Investigation pipeline/.test(fireBoard.body), 'switches to a type with its own statuses');
check(/Scene Exam/.test(fireBoard.body), 'and draws that pipeline instead');
check(!/1st Review/.test(fireBoard.body), 'not the org-wide one');

console.log('\nMOVING A CASE');
const { data: kase } = await svc
  .from('cases')
  .select('id, status_id')
  .eq('case_number', 'NG-2026-0101')
  .single();
const originalStatus = kase.status_id;

const { data: statuses } = await svc
  .from('case_statuses')
  .select('id, key, requires_review_role')
  .is('case_type_id', null);
const openStatus = statuses.find((s) => s.key === 'open');
const reviewStatus = statuses.find((s) => s.key === 'first_review');
const approved = statuses.find((s) => s.key === 'approved');

const { data: moved, error: moveErr } = await inv
  .from('cases')
  .update({ status_id: reviewStatus.id })
  .eq('id', kase.id)
  .select('status_id');
check(!moveErr && moved?.length === 1, 'an investigator moves a case between ordinary columns', moveErr?.message ?? '');

const { error: approveErr } = await inv
  .from('cases')
  .update({ status_id: approved.id })
  .eq('id', kase.id);
check(
  !!approveErr && /reviewer/i.test(approveErr.message),
  'but is refused a column that needs a reviewer',
  approveErr?.message?.slice(0, 50) ?? 'NOT REFUSED',
);

const { data: stillThere } = await svc
  .from('cases')
  .select('status_id')
  .eq('id', kase.id)
  .single();
check(stillThere.status_id === reviewStatus.id, 'and the case did not move');

const { data: revMoved, error: revErr } = await rev
  .from('cases')
  .update({ status_id: approved.id })
  .eq('id', kase.id)
  .select('status_id');
check(!revErr && revMoved?.length === 1, 'a reviewer can make that move', revErr?.message ?? '');

const { error: roErr } = await ro
  .from('cases')
  .update({ status_id: openStatus.id })
  .eq('id', kase.id)
  .select('status_id');
const { data: roRows } = await ro
  .from('cases')
  .update({ status_id: openStatus.id })
  .eq('id', kase.id)
  .select('status_id');
check(!!roErr || (roRows ?? []).length === 0, 'a read_only account moves nothing', roErr?.code ?? '0 rows');

console.log('\nTHE MOVE IS RECORDED WITHOUT THE CLIENT ASKING');
const { data: logs } = await svc
  .from('activity_logs')
  .select('action, metadata')
  .eq('case_id', kase.id)
  .eq('action', 'case.status_changed')
  .order('created_at', { ascending: false })
  .limit(1);
check((logs ?? []).length > 0, 'a status change wrote an activity row');
check(
  Boolean(logs?.[0]?.metadata?.from_status && logs?.[0]?.metadata?.to_status),
  'naming both the old and new status',
  `${logs?.[0]?.metadata?.from_status} -> ${logs?.[0]?.metadata?.to_status}`,
);

console.log('\nADMIN NOTES');
const { data: orgRow } = await svc.from('organizations').select('id').eq('slug', 'northgate').single();
const { data: invUser } = await inv.auth.getUser();
const { data: revUser } = await rev.auth.getUser();

const { data: note, error: noteErr } = await inv
  .from('admin_notes')
  .insert({
    org_id: orgRow.id,
    case_id: kase.id,
    author_id: invUser.user.id,
    body: 'Probe note: chasing the laboratory result.',
  })
  .select('id')
  .single();
check(!noteErr, 'an investigator can add a note', noteErr?.message ?? '');

const { error: replyErr } = await rev.from('admin_notes').insert({
  org_id: orgRow.id,
  case_id: kase.id,
  parent_id: note.id,
  author_id: revUser.user.id,
  body: 'Probe reply: chased, due Friday.',
});
check(!replyErr, 'and another user can reply in the thread', replyErr?.message ?? '');

const { error: forgeErr } = await inv.from('admin_notes').insert({
  org_id: orgRow.id,
  case_id: kase.id,
  author_id: revUser.user.id,
  body: 'Probe forgery',
});
check(!!forgeErr, 'a note cannot be posted under someone else’s name', forgeErr?.code ?? 'NO ERROR');

const { data: foreignEdit } = await rev
  .from('admin_notes')
  .update({ body: 'edited by someone else' })
  .eq('id', note.id)
  .select('id');
check((foreignEdit ?? []).length === 0, 'and cannot be edited by a non-author', `${(foreignEdit ?? []).length} rows`);

const { data: ownEdit } = await inv
  .from('admin_notes')
  .update({ body: 'Probe note: laboratory result received.' })
  .eq('id', note.id)
  .select('id');
check((ownEdit ?? []).length === 1, 'its author can edit it');

const { error: roNoteErr } = await ro.from('admin_notes').insert({
  org_id: orgRow.id,
  case_id: kase.id,
  author_id: (await ro.auth.getUser()).data.user.id,
  body: 'Probe read-only note',
});
check(!!roNoteErr, 'a read_only account cannot add notes', roNoteErr?.code ?? 'NO ERROR');

console.log('\nCLEANUP');
await svc.from('admin_notes').delete().like('body', 'Probe %');
await svc.from('cases').update({ status_id: originalStatus }).eq('id', kase.id);
const { data: restored } = await svc.from('cases').select('status_id').eq('id', kase.id).single();
check(restored.status_id === originalStatus, 'case put back in its original column');
const { count: leftoverNotes } = await svc
  .from('admin_notes')
  .select('id', { count: 'exact', head: true })
  .like('body', 'Probe %');
check(leftoverNotes === 0, 'probe notes removed', String(leftoverNotes));

console.log('\n' + (fail === 0 ? 'PIPELINE: all checks passed' : `PIPELINE: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
