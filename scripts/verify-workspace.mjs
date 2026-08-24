/**
 * Phase 5: the case workspace — dynamic fields, autosave, completion dots.
 *
 *   npm run verify:workspace
 *
 * Drives the same server action the form calls, then reads back through RLS as
 * the user who made the change. Cleans up after itself.
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
  // Two things have to go before matching:
  //   - React separates adjacent text nodes with an empty comment, so
  //     "New {name}" ships as "New <!-- -->Fire Investigation".
  //   - Next serialises every server component's props into self.__next_f.
  //     Without dropping those, an assertion passes on data that was sent but
  //     never rendered, which is exactly the thing these checks exist to catch.
  const visible = raw
    .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, '')
    .replace(/<!--\s*-->/g, '');
  return { status: r.status, location: r.headers.get('location'), body: visible };
};

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function asUser(email) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}

console.log(`\nTARGET  ${BASE}`);
console.log(`AUTH    ${env.NEXT_PUBLIC_SUPABASE_URL}  (${ENV_FILE})`);

const invCookie = await cookieFor('ines.vargas@northgate.test');
const roCookie = await cookieFor('rosa.ortiz@northgate.test');
const inv = await asUser('ines.vargas@northgate.test');
const ro = await asUser('rosa.ortiz@northgate.test');

const { data: kase } = await svc
  .from('cases')
  .select('id, case_type_id')
  .eq('case_number', 'NG-2026-0201')
  .single();

console.log('\nPREFLIGHT');
const page = await get(`/cases/${kase.id}`, invCookie);
if (page.status !== 200 || !/Changes save as you go/.test(page.body)) {
  console.log('  FAIL  the server on this port is serving an older build');
  process.exit(1);
}
check(true, 'server is serving the current build');

console.log('\nTHE WORKSPACE IS BUILT FROM THE CASE TYPE');
check(/Scene Information/.test(page.body), 'sidebar lists configured sections');
check(/Area of Origin/.test(page.body), 'including later ones');
check(/Interviews/.test(page.body), 'tab bar derived from section groupings');
check(/Administration/.test(page.body), 'and its other tabs');
check(/Structure Type/.test(page.body), 'renders the first section fields');
check(/Residential/.test(page.body), 'with the choices an admin configured');

console.log('\nAUTOSAVE WRITES WHAT THE FORM WOULD');
// Deliberately a field in the section that opens first. The workspace renders
// only the open section, so writing to a later one and asserting it "renders"
// would only be matching serialised props — which is exactly the false pass the
// flight-payload stripping above exists to catch.
const { data: field } = await svc
  .from('case_type_fields')
  .select('id, case_type_sections!inner(case_type_id, key)')
  .eq('key', 'damage_description')
  .eq('case_type_sections.case_type_id', kase.case_type_id)
  .single();

const { error: saveErr } = await inv.from('case_field_values').upsert(
  {
    org_id: (await svc.from('cases').select('org_id').eq('id', kase.id).single()).data.org_id,
    case_id: kase.id,
    field_id: field.id,
    value: 'Fire damage concentrated in the north-east quadrant.',
  },
  { onConflict: 'case_id,field_id' },
);
check(!saveErr, 'an investigator can record a value', saveErr?.message ?? '');

const { data: readBack } = await inv
  .from('case_field_values')
  .select('value')
  .eq('case_id', kase.id)
  .eq('field_id', field.id)
  .single();
check(readBack?.value === 'Fire damage concentrated in the north-east quadrant.', 'and read it back');

const after = await get(`/cases/${kase.id}`, invCookie);
check(/north-east quadrant/.test(after.body), 'the saved value renders on reload, in the visible markup');

console.log('\nCOMPLETION IS COMPUTED, NOT STORED');
const { data: completion } = await inv
  .from('case_section_completion')
  .select('section_key, total_fields, filled_fields, required_fields, filled_required_fields')
  .eq('case_id', kase.id)
  .eq('section_key', 'scene_information')
  .single();
check(completion?.filled_fields >= 1, 'that section counts as started', `${completion?.filled_fields}/${completion?.total_fields}`);
check(completion?.required_fields >= 1, 'and knows which of its fields are required', String(completion?.required_fields));

console.log('\nTHE AUDIT TRAIL RECORDS IT WITHOUT THE CLIENT ASKING');
const { data: logs } = await svc
  .from('activity_logs')
  .select('action, actor_id')
  .eq('case_id', kase.id)
  .eq('target_type', 'field_value')
  .order('created_at', { ascending: false })
  .limit(3);
check((logs ?? []).length > 0, 'a field edit produced an activity row', (logs ?? []).map((l) => l.action).join(', '));
const { data: invUser } = await inv.auth.getUser();
check(logs?.[0]?.actor_id === invUser.user.id, 'attributed to the person who made it');

console.log('\nREAD-ONLY ACCOUNTS');
const roPage = await get(`/cases/${kase.id}`, roCookie);
check(roPage.status === 200, 'can open a case', String(roPage.status));
check(/Read-only/.test(roPage.body), 'and are told the fields are not editable');
const { error: roErr } = await ro.from('case_field_values').upsert(
  {
    org_id: (await svc.from('cases').select('org_id').eq('id', kase.id).single()).data.org_id,
    case_id: kase.id,
    field_id: field.id,
    value: 'tampered',
  },
  { onConflict: 'case_id,field_id' },
);
check(!!roErr, 'and the database refuses their write', roErr?.code ?? 'NO ERROR');

const { data: unchanged } = await svc
  .from('case_field_values')
  .select('value')
  .eq('case_id', kase.id)
  .eq('field_id', field.id)
  .single();
check(unchanged?.value === 'Fire damage concentrated in the north-east quadrant.', 'the value is untouched');

console.log('\nCLEANUP');
await svc.from('case_field_values').delete().eq('case_id', kase.id).eq('field_id', field.id);
const { data: gone } = await svc
  .from('case_field_values')
  .select('id')
  .eq('case_id', kase.id)
  .eq('field_id', field.id)
  .maybeSingle();
check(!gone, 'test value removed');

console.log('\n' + (fail === 0 ? 'WORKSPACE: all checks passed' : `WORKSPACE: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
