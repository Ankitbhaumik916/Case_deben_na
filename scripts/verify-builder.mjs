/**
 * Acceptance criteria 1 and 2 from the build plan, against a running server:
 * an admin builds a brand-new discipline entirely through the case type
 * tables, and an investigator immediately works a case of it — no deploy, no
 * code specific to that discipline anywhere. Then it checks the seeded type is
 * untouched, and deletes everything it made.
 *
 *   npm run verify:builder
 *
 * Needs a server on BASE and the local Supabase stack up.
 */
import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100';
const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PW = env.SEED_DEMO_PASSWORD || 'forensibus-demo-1234';
const RUN = Math.random().toString(36).slice(2, 7);

let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};

async function sb(email) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(email + ': ' + error.message);
  return c;
}

async function cookieFor(email) {
  const jar = new Map();
  const c = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach((x) => jar.set(x.name, x.value)),
    },
  });
  await c.auth.signInWithPassword({ email, password: PW });
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
}

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const admin = await sb('ada.lindqvist@northgate.test');
const inv = await sb('ines.vargas@northgate.test');
const { data: org } = await svc.from('organizations').select('id').eq('slug', 'northgate').single();

let typeId = null;
let caseId = null;

try {
  console.log('\nADMIN BUILDS A NEW DISCIPLINE (nothing about it exists in code)');

  const { data: ct, error: ctErr } = await admin
    .from('case_types')
    .insert({
      org_id: org.id,
      name: `Vehicle Theft ${RUN}`,
      slug: `vehicle-theft-${RUN}`,
      icon: 'car',
      color: '#7c3aed',
    })
    .select('id')
    .single();
  check(!ctErr, 'creates the case type', ctErr?.message ?? '');
  typeId = ct.id;

  const { data: sec } = await admin
    .from('case_type_sections')
    .insert([
      { org_id: org.id, case_type_id: typeId, key: 'vehicle', label: 'Vehicle Details', sort_order: 0 },
      { org_id: org.id, case_type_id: typeId, key: 'recovery', label: 'Recovery', sort_order: 1 },
    ])
    .select('id,key');
  check(sec?.length === 2, 'adds two sections');
  const vehicleSec = sec.find((s) => s.key === 'vehicle');

  // PostgREST unions the keys of a bulk insert, so a column absent from one row
  // is sent as explicit NULL instead of taking its default. Every row therefore
  // carries every column — which is also why the app inserts one row at a time.
  const { error: fErr } = await admin.from('case_type_fields').insert([
    { org_id: org.id, section_id: vehicleSec.id, key: 'vin', label: 'VIN', field_type: 'text', options: {}, validation: { required: true }, sort_order: 0 },
    { org_id: org.id, section_id: vehicleSec.id, key: 'recovered', label: 'Recovered', field_type: 'boolean', options: {}, validation: {}, sort_order: 1 },
    { org_id: org.id, section_id: vehicleSec.id, key: 'entry_method', label: 'Entry Method', field_type: 'select', options: { choices: [{ value: 'forced', label: 'Forced' }, { value: 'key', label: 'Key' }] }, validation: {}, sort_order: 2 },
  ]);
  check(!fErr, 'adds fields including a select with choices', fErr?.message ?? '');

  const { error: stErr } = await admin.from('case_statuses').insert([
    { org_id: org.id, case_type_id: typeId, key: 'reported', label: 'Reported', color: '#6b7280', sort_order: 0, is_initial: true, is_terminal: false, requires_review_role: false },
    { org_id: org.id, case_type_id: typeId, key: 'closed', label: 'Closed', color: '#334155', sort_order: 1, is_initial: false, is_terminal: true, requires_review_role: true },
  ]);
  check(!stErr, 'defines its own status pipeline', stErr?.message ?? '');

  const { data: cl } = await admin
    .from('case_type_checklists')
    .insert({ org_id: org.id, case_type_id: typeId, name: 'Theft SOP', source_standard: 'Internal', version: '1.0' })
    .select('id')
    .single();
  const { error: ciErr } = await admin.from('checklist_items').insert([
    { org_id: org.id, checklist_id: cl.id, section_ref: 'vehicle', label: 'VIN verified against registration', sort_order: 0 },
    { org_id: org.id, checklist_id: cl.id, section_ref: 'recovery', label: 'Recovery location photographed', sort_order: 1 },
  ]);
  check(!ciErr, 'attaches a compliance checklist', ciErr?.message ?? '');

  const { error: rsErr } = await admin.from('case_type_report_sections').insert({
    org_id: org.id,
    case_type_id: typeId,
    heading: 'Vehicle and Recovery',
    sort_order: 0,
    source_section_ids: sec.map((s) => s.id),
    draft_prompt: 'Summarise the vehicle and how it was recovered.',
  });
  check(!rsErr, 'defines the report structure', rsErr?.message ?? '');

  console.log('\nTHE UI RENDERS ALL FOUR TABS FOR IT');
  const cookie = await cookieFor('ada.lindqvist@northgate.test');
  const tabs = [
    ['sections', 'Vehicle Details'],
    ['statuses', 'Reported'],
    ['checklist', 'Theft SOP'],
    ['report', 'Vehicle and Recovery'],
  ];
  for (const [t, needle] of tabs) {
    const r = await fetch(`${BASE}/admin/case-types/${typeId}?tab=${t}`, { headers: { cookie } });
    const b = await r.text();
    check(r.status === 200 && b.includes(needle), `?tab=${t} renders "${needle}"`, r.status === 200 ? '' : String(r.status));
  }

  console.log('\nAN INVESTIGATOR IMMEDIATELY WORKS A CASE OF IT — NO DEPLOY');
  const { data: kase, error: cErr } = await inv
    .from('cases')
    .insert({ org_id: org.id, case_type_id: typeId, case_number: `VT-${RUN}`, address: '8 Kerb Lane' })
    .select('id,status_id')
    .single();
  check(!cErr, 'creates a case of the brand-new type', cErr?.message ?? '');
  caseId = kase.id;

  const { data: startStatus } = await svc.from('case_statuses').select('key').eq('id', kase.status_id).single();
  check(startStatus?.key === 'reported', "and it lands on that type's own initial status", startStatus?.key);

  const { data: vinField } = await svc.from('case_type_fields').select('id').eq('section_id', vehicleSec.id).eq('key', 'vin').maybeSingle();
  if (!vinField) throw new Error('field creation failed earlier; cannot continue');
  const { error: vErr } = await inv.from('case_field_values').insert({ case_id: caseId, field_id: vinField.id, value: '1HGCM82633A004352' });
  check(!vErr, 'answers a field defined minutes ago', vErr?.message ?? '');

  const { data: comp } = await inv
    .from('case_section_completion')
    .select('section_key,total_fields,filled_fields,required_fields')
    .eq('case_id', caseId)
    .eq('section_key', 'vehicle')
    .single();
  check(
    comp?.total_fields === 3 && comp?.filled_fields === 1 && comp?.required_fields === 1,
    'completion view tracks it',
    `${comp?.filled_fields}/${comp?.total_fields} filled, ${comp?.required_fields} required`,
  );

  const { data: prog } = await inv
    .from('case_checklist_progress')
    .select('checklist_name,total_items,checked_items')
    .eq('case_id', caseId)
    .single();
  check(prog?.total_items === 2, 'checklist progress view sees the new checks', `${prog?.checked_items}/${prog?.total_items}`);

  const { data: closed } = await svc.from('case_statuses').select('id').eq('case_type_id', typeId).eq('key', 'closed').single();
  const { error: approveErr } = await inv.from('cases').update({ status_id: closed.id }).eq('id', caseId);
  check(
    !!approveErr && /reviewer/i.test(approveErr.message),
    'reviewer-only transition enforced on the new pipeline too',
    approveErr?.message?.slice(0, 55) ?? 'NOT ENFORCED',
  );

  console.log('\nAND THE SEEDED TYPE IS UNTOUCHED');
  const { data: fire } = await inv.from('case_types').select('id').eq('slug', 'fire-investigation').single();
  const { count: fireSections } = await inv.from('case_type_sections').select('id', { count: 'exact', head: true }).eq('case_type_id', fire.id);
  check(fireSections === 7, 'fire investigation still has its 7 sections', String(fireSections));
} finally {
  console.log('\nCLEANUP');
  if (caseId) await svc.from('cases').delete().eq('id', caseId);
  if (typeId) {
    const r = await svc.from('case_types').delete().eq('id', typeId);
    check(!r.error, 'test discipline removed', r.error?.message ?? '');
  }
  const { count } = await svc.from('case_types').select('id', { count: 'exact', head: true });
  check(count === 2, 'back to the two seeded case types', String(count));
}

console.log('\n' + (fail === 0 ? 'BUILDER E2E: all checks passed' : `BUILDER E2E: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
