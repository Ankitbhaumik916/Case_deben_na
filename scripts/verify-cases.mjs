/**
 * Phase 4: the case list, its filters and the create flow.
 *
 *   npm run verify:cases
 *
 * Needs a server on BASE and the Supabase stack the app points at.
 * Everything it creates is removed at the end.
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

// React separates adjacent text nodes with an empty comment in SSR output, so
// "New {name}" ships as "New <!-- -->Fire Investigation". Strip those before
// matching, or every assertion spanning an interpolation fails for no reason.
const get = async (path, cookie) => {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const raw = r.status < 300 ? await r.text() : '';
  return { status: r.status, location: r.headers.get('location'), body: raw.replace(/<!--\s*-->/g, '') };
};

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\nTARGET  ${BASE}`);
console.log(`AUTH    ${env.NEXT_PUBLIC_SUPABASE_URL}  (${ENV_FILE})`);

const inv = await cookieFor('ines.vargas@northgate.test');
const ro = await cookieFor('rosa.ortiz@northgate.test');

console.log('\nLIST VIEW');
const list = await get('/cases', inv);
check(list.status === 200, '/cases returns 200', String(list.status));
check(/NG-2026-0101/.test(list.body), 'renders seeded cases');
check(/Fire Investigation/.test(list.body), 'shows the case type');
check(/Scene Exam|Peer Review|1st Review|Approved|Open/.test(list.body), 'shows status labels');
check(/Days open/.test(list.body), 'days-open column present');

console.log('\nSEARCH — matches beyond the columns on screen');
const byAddress = await get('/cases?q=Foundry', inv);
check(/NG-2026-0101/.test(byAddress.body), 'finds a case by its address');
const byPerson = await get('/cases?q=Okonkwo', inv);
check(/NG-2026-/.test(byPerson.body), 'finds cases by a person recorded on them');
const byField = await get('/cases?q=Ashbury', inv);
check(/NG-2026-/.test(byField.body), 'finds cases by city');
const noMatch = await get('/cases?q=zzzznotathing', inv);
check(/No cases match those filters/.test(noMatch.body), 'a search with no hits says so');

console.log('\nFILTERS');
const fireOnly = await get('/cases?type=fire-investigation', inv);
check(/NG-2026-0201/.test(fireOnly.body), 'type filter keeps fire cases');
check(!/NG-2026-0101/.test(fireOnly.body), 'and drops the others');
const county = await get('/cases?county=Sullivan', inv);
check(/NG-2026-0102/.test(county.body) && !/NG-2026-0101/.test(county.body), 'county filter narrows');
const combined = await get('/cases?type=fire-investigation&county=Sullivan', inv);
check(/NG-2026-0202/.test(combined.body) && !/NG-2026-0201/.test(combined.body), 'filters combine');
check(/Clear all/.test(combined.body), 'active filters show removable chips');

console.log('\nSTATS VIEW');
const stats = await get('/cases?view=stats', inv);
check(stats.status === 200, 'stats renders', String(stats.status));
check(/Avg days open/.test(stats.body), 'shows aggregate cards');
check(/By status/.test(stats.body) && /By county/.test(stats.body), 'breaks down by status and county');

console.log('\nMAP VIEW');
const map = await get('/cases?view=map', inv);
check(map.status === 200, 'map renders', String(map.status));
check(/needs a tile provider/.test(map.body), 'says plainly that it is not built rather than showing an empty box');
check(/carry a position/.test(map.body), 'and reports how many cases have coordinates');

console.log('\nCASE DETAIL');
const { data: one } = await svc.from('cases').select('id').eq('case_number', 'NG-2026-0201').single();
const detail = await get(`/cases/${one.id}`, inv);
check(detail.status === 200, 'a case opens', String(detail.status));
check(/Area of Origin/.test(detail.body), 'renders sections from the case type');
check(/Fire Classification/.test(detail.body), 'renders its configured fields');
check(/Not recorded/.test(detail.body), 'unanswered fields say so');

console.log('\nCREATE FLOW');
const picker = await get('/cases/new', inv);
check(picker.status === 200, 'type picker opens', String(picker.status));
check(/What kind of case/.test(picker.body), 'asks which discipline');
check(/Fire Investigation/.test(picker.body) && /Investigation/.test(picker.body), 'offers both types');

const form = await get('/cases/new?type=fire-investigation', inv);
check(/New Fire Investigation/.test(form.body), 'form is scoped to the chosen type');
check(/Case number/.test(form.body), 'asks for a case number');
check(/What this type will ask for/.test(form.body), 'previews the sections it will collect');

console.log('\nREAD-ONLY ACCOUNTS');
const roList = await get('/cases', ro);
check(roList.status === 200, 'read_only can view the list', String(roList.status));
check(!/New case/.test(roList.body), 'but gets no New case button');
const roNew = await get('/cases/new', ro);
check(/Read-only access/.test(roNew.body), 'and is turned away from the create page');

// RLS is the real gate, not the missing button.
const asRo = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
await asRo.auth.signInWithPassword({ email: 'rosa.ortiz@northgate.test', password: PW });
const { data: types } = await asRo.from('case_types').select('id').limit(1).single();
const { data: orgRow } = await svc.from('organizations').select('id').eq('slug', 'northgate').single();
const { error: roInsert } = await asRo
  .from('cases')
  .insert({ org_id: orgRow.id, case_type_id: types.id, case_number: 'RO-SNEAK' });
check(!!roInsert, 'and posting straight at the table is refused', roInsert?.code ?? 'NO ERROR');

console.log('\nCLEANUP');
await svc.from('cases').delete().eq('case_number', 'RO-SNEAK');
const { count } = await svc.from('cases').select('id', { count: 'exact', head: true });
check(count === 5, 'back to the 5 seeded cases', String(count));

console.log('\n' + (fail === 0 ? 'CASES: all checks passed' : `CASES: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
