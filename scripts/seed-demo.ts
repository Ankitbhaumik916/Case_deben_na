/**
 * Demo data seeder.
 *
 * supabase/seed.sql installs the organisation and the two case type templates.
 * This script adds what only the Auth admin API can create: real sign-in-able
 * accounts, plus a set of cases spread across the pipeline so every view has
 * something in it.
 *
 *   npm run seed:demo
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Safe to
 * re-run: existing users and cases are reused rather than duplicated.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'forensibus-demo-1234';
const ORG_SLUG = 'northgate';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.example to .env.local and fill them in (supabase status prints both).',
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type RoleName = 'read_only' | 'investigator' | 'reviewer' | 'admin' | 'super_admin';

const DEMO_USERS: { email: string; fullName: string; role: RoleName; jobTitle: string }[] = [
  { email: 'sam.okafor@northgate.test',    fullName: 'Sam Okafor',      role: 'super_admin',  jobTitle: 'Director' },
  { email: 'ada.lindqvist@northgate.test', fullName: 'Ada Lindqvist',   role: 'admin',        jobTitle: 'Operations Manager' },
  { email: 'renee.adeyemi@northgate.test', fullName: 'Renée Adeyemi',   role: 'reviewer',     jobTitle: 'Senior Investigator' },
  { email: 'ines.vargas@northgate.test',   fullName: 'Inés Vargas',     role: 'investigator', jobTitle: 'Investigator' },
  { email: 'ivo.nakamura@northgate.test',  fullName: 'Ivo Nakamura',    role: 'investigator', jobTitle: 'Investigator' },
  { email: 'rosa.ortiz@northgate.test',    fullName: 'Rosa Ortiz',      role: 'read_only',    jobTitle: 'Records Clerk' },
];

function fail(context: string, error: { message: string } | null): void {
  if (error) {
    console.error(`✗ ${context}: ${error.message}`);
    process.exit(1);
  }
}

async function findOrCreateUser(
  client: SupabaseClient,
  orgId: string,
  user: (typeof DEMO_USERS)[number],
): Promise<string> {
  const { data: existing } = await client
    .from('users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  let userId = existing?.id as string | undefined;

  if (!userId) {
    const { data, error } = await client.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.fullName, org_id: orgId },
    });
    if (error || !data?.user) {
      console.error(`✗ creating ${user.email}: ${error?.message ?? 'no user returned'}`);
      process.exit(1);
    }
    userId = data.user.id;
  }

  // handle_new_user() creates the profile row; fill in the rest.
  fail(
    `updating profile for ${user.email}`,
    (
      await client
        .from('users')
        .update({ org_id: orgId, full_name: user.fullName, job_title: user.jobTitle })
        .eq('id', userId!)
    ).error,
  );

  const { data: role } = await client.from('roles').select('id').eq('name', user.role).single();
  fail(
    `granting ${user.role} to ${user.email}`,
    (
      await client
        .from('user_roles')
        .upsert(
          { user_id: userId!, role_id: role!.id, org_id: orgId },
          { onConflict: 'user_id,role_id,org_id', ignoreDuplicates: true },
        )
    ).error,
  );

  return userId!;
}

async function main(): Promise<void> {
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, name')
    .eq('slug', ORG_SLUG)
    .single();

  if (orgError || !org) {
    console.error(
      `Organisation "${ORG_SLUG}" not found. Run the migrations and supabase/seed.sql first ` +
        '(npm run db:reset for a local stack).',
    );
    process.exit(1);
  }

  const orgId = org.id as string;
  console.log(`→ organisation: ${org.name}`);

  const userIds: Record<string, string> = {};
  for (const user of DEMO_USERS) {
    userIds[user.email] = await findOrCreateUser(db, orgId, user);
    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  const { data: caseTypes } = await db
    .from('case_types')
    .select('id, slug')
    .eq('org_id', orgId);
  const typeBySlug = Object.fromEntries((caseTypes ?? []).map((t) => [t.slug, t.id as string]));

  const { data: statuses } = await db
    .from('case_statuses')
    .select('id, key, case_type_id')
    .eq('org_id', orgId);

  const statusId = (key: string, caseTypeId: string | null = null) =>
    statuses?.find((s) => s.key === key && s.case_type_id === caseTypeId)?.id as string | undefined;

  const investigator = userIds['ines.vargas@northgate.test'];
  const secondInvestigator = userIds['ivo.nakamura@northgate.test'];
  const reviewer = userIds['renee.adeyemi@northgate.test'];

  const DEMO_CASES = [
    {
      case_number: 'NG-2026-0101',
      typeSlug: 'investigation',
      statusKey: 'open',
      title: 'Warehouse inventory shortfall',
      address: '1420 Foundry Street',
      city: 'Ashbury',
      county: 'Marion',
      state: 'IN',
      lat: 39.7684,
      lng: -86.1581,
      lead: investigator,
      incident_date: '2026-06-14',
    },
    {
      case_number: 'NG-2026-0102',
      typeSlug: 'investigation',
      statusKey: 'first_review',
      title: 'Disputed vehicle damage claim',
      address: '77 Halstead Avenue',
      city: 'Kingsport',
      county: 'Sullivan',
      state: 'TN',
      lat: 36.5484,
      lng: -82.5618,
      lead: secondInvestigator,
      incident_date: '2026-05-30',
    },
    {
      case_number: 'NG-2026-0103',
      typeSlug: 'investigation',
      statusKey: 'approved',
      title: 'Perimeter security breach',
      address: '9 Bellweather Road',
      city: 'Ashbury',
      county: 'Marion',
      state: 'IN',
      lat: 39.7912,
      lng: -86.148,
      lead: investigator,
      incident_date: '2026-04-02',
    },
    {
      case_number: 'NG-2026-0201',
      typeSlug: 'fire-investigation',
      statusKey: 'scene_exam',
      title: 'Single family dwelling fire',
      address: '308 Cedar Hollow Lane',
      city: 'Ashbury',
      county: 'Marion',
      state: 'IN',
      lat: 39.7401,
      lng: -86.19,
      lead: secondInvestigator,
      incident_date: '2026-07-19',
    },
    {
      case_number: 'NG-2026-0202',
      typeSlug: 'fire-investigation',
      statusKey: 'peer_review',
      title: 'Commercial kitchen fire',
      address: '55 Marlow Court',
      city: 'Kingsport',
      county: 'Sullivan',
      state: 'TN',
      lat: 36.5321,
      lng: -82.5401,
      lead: investigator,
      incident_date: '2026-03-08',
    },
  ];

  for (const demo of DEMO_CASES) {
    const caseTypeId = typeBySlug[demo.typeSlug];
    if (!caseTypeId) {
      console.warn(`  ! case type ${demo.typeSlug} missing, skipping ${demo.case_number}`);
      continue;
    }

    const { data: existing } = await db
      .from('cases')
      .select('id')
      .eq('org_id', orgId)
      .eq('case_number', demo.case_number)
      .maybeSingle();

    if (existing) {
      console.log(`  · ${demo.case_number} already present`);
      continue;
    }

    const typeScopedStatus = statusId(demo.statusKey, caseTypeId);
    const { data: created, error } = await db
      .from('cases')
      .insert({
        org_id: orgId,
        case_type_id: caseTypeId,
        status_id: typeScopedStatus ?? statusId(demo.statusKey) ?? null,
        case_number: demo.case_number,
        title: demo.title,
        address: demo.address,
        city: demo.city,
        county: demo.county,
        state: demo.state,
        lat: demo.lat,
        lng: demo.lng,
        incident_date: demo.incident_date,
        lead_investigator_id: demo.lead,
        created_by: demo.lead,
      })
      .select('id')
      .single();
    fail(`creating ${demo.case_number}`, error);

    const caseId = created!.id as string;

    fail(
      'assigning investigators',
      (
        await db.from('case_investigators').insert([
          { case_id: caseId, user_id: demo.lead, role: 'lead' },
          { case_id: caseId, user_id: reviewer, role: 'secondary' },
        ])
      ).error,
    );

    fail(
      'adding people',
      (
        await db.from('case_people').insert([
          {
            case_id: caseId,
            role: 'witness',
            full_name: 'Marguerite Okonkwo',
            contact_info: { phone: '555-0142', email: 'm.okonkwo@example.test' },
          },
          {
            case_id: caseId,
            role: 'owner',
            full_name: 'Theodore Brandt',
            contact_info: { phone: '555-0177' },
          },
        ])
      ).error,
    );

    // Fill the first section so the sidebar shows real completion state.
    const { data: fields } = await db
      .from('case_type_fields')
      .select('id, key, field_type, case_type_sections!inner(key, case_type_id)')
      .eq('case_type_sections.case_type_id', caseTypeId);

    const valueFor = (key: string, fieldType: string): unknown | undefined => {
      const samples: Record<string, unknown> = {
        summary:
          'Initial notification received from the site manager. Attendance arranged for the following morning.',
        reported_by: 'Site manager, Theodore Brandt',
        incident_type: 'property',
        damage_description:
          'Fire damage concentrated in the north-east quadrant with smoke staining throughout the roof space.',
        structure_type: 'residential',
        suppression_agency: 'Ashbury Fire District',
        area_of_origin: 'North-east bedroom, floor level adjacent to the east wall',
      };
      if (key in samples) return samples[key];
      if (fieldType === 'boolean') return true;
      return undefined;
    };

    const values = (fields ?? [])
      .map((f) => ({
        case_id: caseId,
        field_id: f.id as string,
        value: valueFor(f.key as string, f.field_type as string),
      }))
      .filter((row) => row.value !== undefined);

    if (values.length) {
      fail('writing field values', (await db.from('case_field_values').insert(values)).error);
    }

    const { data: evidence, error: evidenceError } = await db
      .from('evidence_items')
      .insert({
        case_id: caseId,
        item_number: '001',
        category: 'Physical',
        description:
          demo.typeSlug === 'fire-investigation'
            ? 'Section of branch circuit wiring recovered from the area of origin'
            : 'Padlock removed from the north loading door',
        collected_from: demo.address,
        collected_at: new Date(demo.incident_date).toISOString(),
        collected_by: 'Inés Vargas',
        exam_requested: 'Laboratory examination',
      })
      .select('id')
      .single();
    fail('creating evidence', evidenceError);

    const collectedAt = new Date(demo.incident_date);
    const transferredAt = new Date(collectedAt.getTime() + 86_400_000);
    fail(
      'creating custody events',
      (
        await db.from('custody_events').insert([
          {
            evidence_id: evidence!.id as string,
            event_type: 'collected',
            actor_name: 'Inés Vargas',
            location: demo.address,
            occurred_at: collectedAt.toISOString(),
            notes: 'Photographed in place before removal.',
          },
          {
            evidence_id: evidence!.id as string,
            event_type: 'transferred',
            actor_name: 'Regional Laboratory intake',
            location: 'Regional Laboratory, Evidence Receiving',
            occurred_at: transferredAt.toISOString(),
            notes: 'Sealed and signed over to laboratory intake.',
          },
        ])
      ).error,
    );

    fail(
      'creating interview',
      (
        await db.from('interviews').insert({
          case_id: caseId,
          subject_name: 'Marguerite Okonkwo',
          conducted_by: 'Inés Vargas',
          conducted_by_id: demo.lead,
          interview_date: transferredAt.toISOString(),
          location: 'Site office',
          transcript_status: 'not_started',
          narrative:
            '<p>The witness described arriving at approximately 06:40 and noticing the door standing open.</p>',
        })
      ).error,
    );

    fail(
      'creating admin note',
      (
        await db.from('admin_notes').insert({
          case_id: caseId,
          author_id: reviewer,
          body: 'Laboratory result outstanding. Chase before the next review cycle.',
        })
      ).error,
    );

    console.log(`  ✓ ${demo.case_number} (${demo.typeSlug}, ${demo.statusKey})`);
  }

  console.log('\nDemo data ready.');
  console.log(`Sign in with any address above, password: ${PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
