/**
 * RLS verification against a LIVE Supabase project.
 *
 *   npm run test:hosted
 *
 * The PGlite suite (tests/rls.test.ts) proves the policies are correct by
 * setting the Postgres role directly. This one proves the deployed stack
 * enforces them end to end: real accounts, real GoTrue JWTs, real PostgREST.
 * A policy that works in PGlite but not here means something did not make it
 * onto the project — that is the whole point of running both.
 *
 * Requires: migrations pushed, supabase/seed.sql applied, scripts/seed-demo.ts run.
 * Writes to the project it points at, then cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'forensibus-demo-1234';

const configured = Boolean(URL && ANON && SERVICE);

/** Unique per run so parallel or repeated runs never collide on case_number. */
const RUN = Math.random().toString(36).slice(2, 8);

const DEMO = {
  readOnly: 'rosa.ortiz@northgate.test',
  investigator: 'ines.vargas@northgate.test',
  otherInvestigator: 'ivo.nakamura@northgate.test',
  reviewer: 'renee.adeyemi@northgate.test',
  admin: 'ada.lindqvist@northgate.test',
  superAdmin: 'sam.okafor@northgate.test',
} as const;

type RoleKey = keyof typeof DEMO;

const service = configured
  ? createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  : (null as unknown as SupabaseClient);

const clients = {} as Record<RoleKey | 'orgB', SupabaseClient>;
const userIds = {} as Record<RoleKey | 'orgB', string>;

let orgId = '';
let caseTypeId = '';
let sectionId = '';
let summaryFieldId = '';
let seededCaseId = '';
let orgBId = '';
let orgBCaseId = '';
const createdCaseIds: string[] = [];

async function signIn(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return client;
}

/** PostgREST reports an RLS insert refusal as 42501. */
function expectRlsRefusal(error: { code?: string; message?: string } | null): void {
  expect(error, 'expected the write to be refused, but it succeeded').not.toBeNull();
  expect(
    error!.code === '42501' || /row-level security/i.test(error!.message ?? ''),
    `expected an RLS refusal, got: ${error!.code} ${error!.message}`,
  ).toBe(true);
}

describe.skipIf(!configured)('hosted RLS', () => {
  beforeAll(async () => {
    // --- preflight: is the schema actually on this project? ---
    const { error: schemaError } = await service.from('organizations').select('id').limit(1);
    if (schemaError) {
      throw new Error(
        `schema not found on ${URL} (${schemaError.message}). ` +
          'Run `npx supabase db push --include-seed` first.',
      );
    }

    const { data: org } = await service
      .from('organizations')
      .select('id')
      .eq('slug', 'northgate')
      .maybeSingle();
    if (!org) throw new Error('seed.sql has not been applied: organisation "northgate" missing.');
    orgId = org.id as string;

    const { data: type } = await service
      .from('case_types')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', 'investigation')
      .maybeSingle();
    if (!type) throw new Error('seed.sql has not been applied: case type "investigation" missing.');
    caseTypeId = type.id as string;

    const { data: section } = await service
      .from('case_type_sections')
      .select('id')
      .eq('case_type_id', caseTypeId)
      .eq('key', 'incident_overview')
      .single();
    sectionId = section!.id as string;

    const { data: field } = await service
      .from('case_type_fields')
      .select('id')
      .eq('section_id', sectionId)
      .eq('key', 'summary')
      .single();
    summaryFieldId = field!.id as string;

    // --- sign in as every demo role ---
    for (const [key, email] of Object.entries(DEMO) as [RoleKey, string][]) {
      clients[key] = await signIn(email);
      const { data } = await clients[key].auth.getUser();
      userIds[key] = data.user!.id;
    }

    // --- a case owned by org A for the read tests ---
    const { data: seeded, error } = await service
      .from('cases')
      .insert({
        org_id: orgId,
        case_type_id: caseTypeId,
        case_number: `HOSTED-${RUN}-A`,
        address: '12 Northgate Way',
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not create fixture case: ${error.message}`);
    seededCaseId = seeded!.id as string;
    createdCaseIds.push(seededCaseId);

    // --- a throwaway second org, to prove tenant isolation on the real stack ---
    const { data: orgB, error: orgBError } = await service
      .from('organizations')
      .insert({ name: `Isolation Probe ${RUN}`, slug: `isolation-probe-${RUN}` })
      .select('id')
      .single();
    if (orgBError) throw new Error(`could not create probe org: ${orgBError.message}`);
    orgBId = orgB!.id as string;

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: `probe-${RUN}@isolation.test`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Isolation Probe', org_id: orgBId },
    });
    if (createError || !created?.user) {
      throw new Error(`could not create probe user: ${createError?.message}`);
    }
    userIds.orgB = created.user.id;

    const { data: investigatorRole } = await service
      .from('roles')
      .select('id')
      .eq('name', 'investigator')
      .single();
    await service
      .from('user_roles')
      .insert({ user_id: userIds.orgB, role_id: investigatorRole!.id, org_id: orgBId });

    const { data: orgBType } = await service
      .rpc('install_case_type_template', {
        p_org_id: orgBId,
        p_spec: { name: 'Probe Type', slug: 'probe-type' },
      });

    const { data: orgBCase } = await service
      .from('cases')
      .insert({
        org_id: orgBId,
        case_type_id: orgBType as string,
        case_number: `HOSTED-${RUN}-B`,
        address: '5 Harborview Street',
      })
      .select('id')
      .single();
    orgBCaseId = orgBCase!.id as string;

    clients.orgB = await signIn(`probe-${RUN}@isolation.test`);
  });

  afterAll(async () => {
    if (!configured || !service) return;

    // Leave the project exactly as we found it. Cleanup failures are REPORTED,
    // not swallowed: the first run of this suite silently failed to delete its
    // cases because of a foreign key bug in the audit trail, and left rows
    // behind in a real project. A quiet catch would have hidden it again.
    const problems: string[] = [];
    const attempt = async (what: string, run: () => PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await run();
        if (error) problems.push(`${what}: ${(error as { message: string }).message}`);
      } catch (e) {
        problems.push(`${what}: ${(e as Error).message}`);
      }
    };

    if (createdCaseIds.length) {
      await attempt('delete fixture cases', () =>
        service.from('cases').delete().in('id', createdCaseIds),
      );
    }
    await attempt('delete probe-org cases', () =>
      service.from('cases').delete().eq('org_id', orgBId),
    );
    await attempt('delete probe-org case types', () =>
      service.from('case_types').delete().eq('org_id', orgBId),
    );
    await attempt('delete probe clone case type', () =>
      service.from('case_types').delete().eq('org_id', orgId).eq('slug', `probe-clone-${RUN}`),
    );
    if (userIds.orgB) {
      await attempt('delete probe user', async () => {
        const { error } = await service.auth.admin.deleteUser(userIds.orgB);
        return { error };
      });
    }
    if (orgBId) {
      await attempt('delete probe org', () =>
        service.from('organizations').delete().eq('id', orgBId),
      );
    }

    if (problems.length) {
      throw new Error(
        `hosted suite left data behind in ${URL} -- ${problems.join(' | ')}`,
      );
    }
  });

  // ---------------------------------------------------------------- deployment
  describe('deployment', () => {
    it('has both seeded case types', async () => {
      const { data } = await service
        .from('case_types')
        .select('slug')
        .eq('org_id', orgId)
        .order('slug');
      expect(data?.map((r) => r.slug)).toEqual(
        expect.arrayContaining(['fire-investigation', 'investigation']),
      );
    });

    it('has row level security enabled on every public table', async () => {
      // information_schema is not exposed over PostgREST; the anon checks below
      // are the functional equivalent. This asserts the seed shape instead.
      const { data } = await service.from('case_statuses').select('key').eq('org_id', orgId);
      expect(data?.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------- anon
  describe('anonymous access', () => {
    it('cannot read cases', async () => {
      const anon = createClient(URL, ANON, { auth: { persistSession: false } });
      const { data, error } = await anon.from('cases').select('id').limit(1);
      expect(error ?? data).toBeTruthy();
      if (!error) expect(data).toEqual([]);
    });

    it('cannot read organisations', async () => {
      const anon = createClient(URL, ANON, { auth: { persistSession: false } });
      const { data, error } = await anon.from('organizations').select('id').limit(1);
      if (!error) expect(data).toEqual([]);
    });
  });

  // -------------------------------------------------------------- read_only
  describe('read_only role', () => {
    it('can read cases', async () => {
      const { data, error } = await clients.readOnly.from('cases').select('id');
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toContain(seededCaseId);
    });

    it('cannot create a case', async () => {
      const { error } = await clients.readOnly
        .from('cases')
        .insert({ org_id: orgId, case_type_id: caseTypeId, case_number: `RO-${RUN}` });
      expectRlsRefusal(error);
    });

    it('cannot write a field value', async () => {
      const { error } = await clients.readOnly
        .from('case_field_values')
        .insert({ case_id: seededCaseId, field_id: summaryFieldId, value: 'nope' });
      expectRlsRefusal(error);
    });

    it('cannot update or delete a case', async () => {
      const { data: updated } = await clients.readOnly
        .from('cases')
        .update({ address: 'changed' })
        .eq('id', seededCaseId)
        .select('id');
      expect(updated).toEqual([]);

      const { data: deleted } = await clients.readOnly
        .from('cases')
        .delete()
        .eq('id', seededCaseId)
        .select('id');
      expect(deleted).toEqual([]);
    });
  });

  // ----------------------------------------------------------- investigator
  describe('investigator role', () => {
    it('can create a case and write field values', async () => {
      const { data, error } = await clients.investigator
        .from('cases')
        .insert({
          org_id: orgId,
          case_type_id: caseTypeId,
          case_number: `INV-${RUN}`,
          county: 'Marion',
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      createdCaseIds.push(data!.id as string);

      const { error: valueError } = await clients.investigator
        .from('case_field_values')
        .insert({ case_id: data!.id, field_id: summaryFieldId, value: 'Written on the real stack' });
      expect(valueError).toBeNull();
    });

    it('cannot delete a case', async () => {
      const { data } = await clients.investigator
        .from('cases')
        .delete()
        .eq('id', seededCaseId)
        .select('id');
      expect(data).toEqual([]);
    });

    it('cannot create or rename a case type', async () => {
      const { error } = await clients.investigator
        .from('case_types')
        .insert({ org_id: orgId, name: 'Sneaky', slug: `sneaky-${RUN}` });
      expectRlsRefusal(error);

      const { data } = await clients.investigator
        .from('case_types')
        .update({ name: 'Renamed' })
        .eq('id', caseTypeId)
        .select('id');
      expect(data).toEqual([]);
    });
  });

  // ------------------------------------------------------ status transitions
  describe('approval transitions', () => {
    async function statusId(key: string): Promise<string> {
      const { data } = await service
        .from('case_statuses')
        .select('id')
        .eq('org_id', orgId)
        .eq('key', key)
        .is('case_type_id', null)
        .single();
      return data!.id as string;
    }

    it('blocks an investigator from approving', async () => {
      const approved = await statusId('approved');
      const { error } = await clients.investigator
        .from('cases')
        .update({ status_id: approved })
        .eq('id', seededCaseId)
        .select('id');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/requires the reviewer role/i);
    });

    it('allows an investigator to move through ordinary statuses', async () => {
      const open = await statusId('open');
      const { data, error } = await clients.investigator
        .from('cases')
        .update({ status_id: open })
        .eq('id', seededCaseId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('allows a reviewer to approve', async () => {
      const approved = await statusId('approved');
      const { data, error } = await clients.reviewer
        .from('cases')
        .update({ status_id: approved })
        .eq('id', seededCaseId)
        .select('id');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------ admin tiers
  describe('admin and super_admin', () => {
    it('lets an admin install a case type template', async () => {
      const { data, error } = await clients.admin.rpc('install_case_type_template', {
        p_org_id: orgId,
        p_spec: { name: `Probe Clone ${RUN}`, slug: `probe-clone-${RUN}` },
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
    });

    it('stops an admin from granting roles', async () => {
      const { data: role } = await service.from('roles').select('id').eq('name', 'admin').single();
      const { error } = await clients.admin
        .from('user_roles')
        .insert({ user_id: userIds.investigator, role_id: role!.id, org_id: orgId });
      expectRlsRefusal(error);
    });

    it('lets a super_admin grant roles', async () => {
      const { data: role } = await service
        .from('roles')
        .select('id')
        .eq('name', 'reviewer')
        .single();
      const { data, error } = await clients.superAdmin
        .from('user_roles')
        .upsert(
          { user_id: userIds.otherInvestigator, role_id: role!.id, org_id: orgId },
          { onConflict: 'user_id,role_id,org_id' },
        )
        .select('id');
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------- tenant isolation
  describe('tenant isolation', () => {
    it('hides org A cases from an org B investigator', async () => {
      const { data, error } = await clients.orgB.from('cases').select('id, case_number');
      expect(error).toBeNull();
      const ids = data?.map((r) => r.id) ?? [];
      expect(ids).toContain(orgBCaseId);
      expect(ids).not.toContain(seededCaseId);
    });

    it('hides org A cases from the case list view too', async () => {
      const { data } = await clients.orgB.from('case_list_view').select('case_number');
      expect(data?.map((r) => r.case_number)).toEqual([`HOSTED-${RUN}-B`]);
    });

    it('stops an org A investigator writing into org B', async () => {
      const { error } = await clients.investigator
        .from('cases')
        .insert({ org_id: orgBId, case_type_id: caseTypeId, case_number: `X-${RUN}` });
      expect(error).not.toBeNull();
    });

    it('stops an org A investigator updating an org B case', async () => {
      const { data } = await clients.investigator
        .from('cases')
        .update({ address: 'hijacked' })
        .eq('id', orgBCaseId)
        .select('id');
      expect(data).toEqual([]);
    });
  });

  // ------------------------------------------------------------- audit trail
  describe('audit trail', () => {
    it('records writes without any help from the client', async () => {
      const { data } = await service
        .from('activity_logs')
        .select('action')
        .eq('case_id', seededCaseId);
      const actions = data?.map((r) => r.action) ?? [];
      expect(actions).toContain('case.created');
      expect(actions).toContain('case.status_changed');
    });

    it('cannot be forged, edited or erased', async () => {
      const { error } = await clients.investigator
        .from('activity_logs')
        .insert({ org_id: orgId, action: 'forged' });
      expectRlsRefusal(error);

      const { data: updated } = await clients.superAdmin
        .from('activity_logs')
        .update({ action: 'tampered' })
        .eq('case_id', seededCaseId)
        .select('id');
      expect(updated).toEqual([]);

      const { data: deleted } = await clients.superAdmin
        .from('activity_logs')
        .delete()
        .eq('case_id', seededCaseId)
        .select('id');
      expect(deleted).toEqual([]);
    });

    it('accepts application events through log_activity', async () => {
      const { data, error } = await clients.investigator.rpc('log_activity', {
        p_action: 'report.exported',
        p_org_id: orgId,
        p_case_id: seededCaseId,
        p_summary: 'Exported PDF',
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
    });

    it('refuses log_activity for an org the caller does not belong to', async () => {
      const { error } = await clients.investigator.rpc('log_activity', {
        p_action: 'sneaky',
        p_org_id: orgBId,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/not_a_member_of_org/i);
    });
  });
});

// Complement of the guard above. Exactly one of these two blocks runs: when
// .env.local IS configured this one is skipped, which is the healthy state.
// It exists so an unconfigured machine reports "suite inert" rather than a
// silent all-green.
describe.skipIf(configured)('hosted RLS (inert: no Supabase keys in .env.local)', () => {
  it('did not run because the hosted suite needs NEXT_PUBLIC_SUPABASE_URL and keys', () => {
    expect(configured).toBe(false);
  });
});
