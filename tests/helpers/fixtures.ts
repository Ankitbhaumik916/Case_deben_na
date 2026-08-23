import type { TestDb } from './pglite-db';

export const SEED_ORG_ID = '11111111-1111-4111-8111-111111111111';

export type RoleName = 'read_only' | 'investigator' | 'reviewer' | 'admin' | 'super_admin';

/**
 * Creates an auth user (which fires handle_new_user) and grants it a role in
 * the given org. Must be called while acting as the service/superuser role.
 */
export async function createUser(
  db: TestDb,
  opts: { orgId: string; email: string; role: RoleName; fullName?: string },
): Promise<string> {
  const [{ id }] = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text, 'org_id', $3::text))
     returning id`,
    [opts.email, opts.fullName ?? opts.email, opts.orgId],
  );

  await db.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     select $1, r.id, $2 from public.roles r where r.name = $3`,
    [id, opts.orgId, opts.role],
  );

  return id;
}

export async function createOrg(db: TestDb, name: string, slug: string): Promise<string> {
  const [{ id }] = await db.query<{ id: string }>(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [name, slug],
  );
  return id;
}

export async function getCaseTypeId(db: TestDb, orgId: string, slug: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `select id from public.case_types where org_id = $1 and slug = $2`,
    [orgId, slug],
  );
  return row.id;
}

export async function getStatusId(
  db: TestDb,
  orgId: string,
  key: string,
  caseTypeId: string | null = null,
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `select id from public.case_statuses
      where org_id = $1 and key = $2
        and case_type_id is not distinct from $3::uuid`,
    [orgId, key, caseTypeId],
  );
  return row.id;
}

export async function createCase(
  db: TestDb,
  opts: {
    orgId: string;
    caseTypeId: string;
    caseNumber: string;
    address?: string;
    county?: string;
    createdBy?: string;
  },
): Promise<string> {
  const [{ id }] = await db.query<{ id: string }>(
    `insert into public.cases (org_id, case_type_id, case_number, address, county, created_by)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      opts.orgId,
      opts.caseTypeId,
      opts.caseNumber,
      opts.address ?? null,
      opts.county ?? null,
      opts.createdBy ?? null,
    ],
  );
  return id;
}

/** Resolves a field id from its case type slug, section key and field key. */
export async function getFieldId(
  db: TestDb,
  orgId: string,
  caseTypeSlug: string,
  sectionKey: string,
  fieldKey: string,
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `select f.id
       from public.case_type_fields f
       join public.case_type_sections s on s.id = f.section_id
       join public.case_types t on t.id = s.case_type_id
      where t.org_id = $1 and t.slug = $2 and s.key = $3 and f.key = $4`,
    [orgId, caseTypeSlug, sectionKey, fieldKey],
  );
  return row.id;
}
