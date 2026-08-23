import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './helpers/pglite-db';
import {
  SEED_ORG_ID,
  createCase,
  createOrg,
  createUser,
  getCaseTypeId,
  getFieldId,
  getStatusId,
} from './helpers/fixtures';

let db: TestDb;

const users: Record<string, string> = {};
let orgBId: string;
let orgACaseTypeId: string;
let orgBCaseTypeId: string;
let orgACaseId: string;
let orgBCaseId: string;

const MINIMAL_TEMPLATE = JSON.stringify({
  name: 'Burglary Investigation',
  slug: 'burglary-investigation',
  icon: 'lock',
  color: '#7c3aed',
  statuses: [
    { key: 'intake', label: 'Intake', color: '#6b7280', is_initial: true },
    { key: 'filed', label: 'Filed', color: '#0891b2', requires_review_role: true },
  ],
  sections: [
    {
      key: 'point_of_entry',
      label: 'Point of Entry',
      fields: [
        { key: 'entry_method', label: 'Method of Entry', field_type: 'text' },
        { key: 'forced', label: 'Forced Entry', field_type: 'boolean' },
      ],
    },
  ],
});

beforeAll(async () => {
  db = await createTestDb();
  await db.asService();

  orgACaseTypeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');

  orgBId = await createOrg(db, 'Harborview Forensics', 'harborview');
  await db.query(
    `insert into public.case_statuses (org_id, case_type_id, key, label, sort_order, is_initial)
     values ($1, null, 'open', 'Open', 0, true)`,
    [orgBId],
  );
  const [{ id }] = await db.query<{ id: string }>(
    `select public.install_case_type_template($1, $2::jsonb) as id`,
    [orgBId, MINIMAL_TEMPLATE],
  );
  orgBCaseTypeId = id;

  users.readOnly = await createUser(db, {
    orgId: SEED_ORG_ID,
    email: 'ro@northgate.test',
    role: 'read_only',
    fullName: 'Rosa Ortiz',
  });
  users.investigator = await createUser(db, {
    orgId: SEED_ORG_ID,
    email: 'inv@northgate.test',
    role: 'investigator',
    fullName: 'Ines Vargas',
  });
  users.otherInvestigator = await createUser(db, {
    orgId: SEED_ORG_ID,
    email: 'inv2@northgate.test',
    role: 'investigator',
    fullName: 'Ivo Nakamura',
  });
  users.reviewer = await createUser(db, {
    orgId: SEED_ORG_ID,
    email: 'rev@northgate.test',
    role: 'reviewer',
    fullName: 'Renée Adeyemi',
  });
  users.admin = await createUser(db, {
    orgId: SEED_ORG_ID,
    email: 'admin@northgate.test',
    role: 'admin',
    fullName: 'Ada Lindqvist',
  });
  users.superAdmin = await createUser(db, {
    orgId: SEED_ORG_ID,
    email: 'super@northgate.test',
    role: 'super_admin',
    fullName: 'Sam Okafor',
  });
  users.orgBInvestigator = await createUser(db, {
    orgId: orgBId,
    email: 'inv@harborview.test',
    role: 'investigator',
    fullName: 'Bran Whitlock',
  });

  orgACaseId = await createCase(db, {
    orgId: SEED_ORG_ID,
    caseTypeId: orgACaseTypeId,
    caseNumber: 'A-1000',
    address: '12 Northgate Way',
  });
  orgBCaseId = await createCase(db, {
    orgId: orgBId,
    caseTypeId: orgBCaseTypeId,
    caseNumber: 'B-1000',
    address: '5 Harborview Street',
  });
});

afterAll(async () => {
  await db?.close();
});

describe('tenant isolation', () => {
  it('hides another org’s cases from an investigator', async () => {
    await db.asUser(users.investigator);
    const rows = await db.query<{ id: string }>(`select id from public.cases`);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(orgACaseId);
    expect(ids).not.toContain(orgBCaseId);
  });

  it('hides another org’s case types and templates', async () => {
    await db.asUser(users.investigator);
    const types = await db.query<{ slug: string }>(`select slug from public.case_types`);
    expect(types.map((t) => t.slug)).not.toContain('burglary-investigation');

    const sections = await db.query<{ count: number }>(
      `select count(*)::int from public.case_type_sections where org_id = $1`,
      [orgBId],
    );
    expect(sections[0].count).toBe(0);
  });

  it('refuses to write a case into another org', async () => {
    await db.asUser(users.investigator);
    await expect(
      db.query(
        `insert into public.cases (org_id, case_type_id, case_number)
         values ($1, $2, 'B-9999')`,
        [orgBId, orgBCaseTypeId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot update another org’s case even knowing its id', async () => {
    await db.asUser(users.investigator);
    const rows = await db.query<{ id: string }>(
      `update public.cases set address = 'hijacked' where id = $1 returning id`,
      [orgBCaseId],
    );
    expect(rows).toEqual([]);
  });

  it('scopes the case list view to the caller’s org', async () => {
    await db.asUser(users.orgBInvestigator);
    const rows = await db.query<{ case_number: string }>(
      `select case_number from public.case_list_view`,
    );
    expect(rows.map((r) => r.case_number)).toEqual(['B-1000']);
  });
});

describe('anonymous access', () => {
  it('reads nothing', async () => {
    await db.asAnon();
    await expect(db.query(`select id from public.cases`)).rejects.toThrow(/permission denied/i);
  });
});

describe('read_only role', () => {
  it('can read cases', async () => {
    await db.asUser(users.readOnly);
    const rows = await db.query<{ id: string }>(`select id from public.cases`);
    expect(rows.map((r) => r.id)).toContain(orgACaseId);
  });

  it('cannot create a case', async () => {
    await db.asUser(users.readOnly);
    await expect(
      db.query(
        `insert into public.cases (org_id, case_type_id, case_number) values ($1, $2, 'RO-1')`,
        [SEED_ORG_ID, orgACaseTypeId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot edit a field value', async () => {
    const fieldId = await getFieldId(db, SEED_ORG_ID, 'investigation', 'incident_overview', 'summary');
    await db.asUser(users.readOnly);
    await expect(
      db.query(
        `insert into public.case_field_values (case_id, field_id, value)
         values ($1, $2, to_jsonb('nope'::text))`,
        [orgACaseId, fieldId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot update or delete a case', async () => {
    await db.asUser(users.readOnly);
    const updated = await db.query(
      `update public.cases set address = 'changed' where id = $1 returning id`,
      [orgACaseId],
    );
    expect(updated).toEqual([]);

    const deleted = await db.query(`delete from public.cases where id = $1 returning id`, [
      orgACaseId,
    ]);
    expect(deleted).toEqual([]);
  });
});

describe('investigator role', () => {
  it('can create and edit cases and field values', async () => {
    await db.asUser(users.investigator);
    const [{ id }] = await db.query<{ id: string }>(
      `insert into public.cases (org_id, case_type_id, case_number, county)
       values ($1, $2, 'INV-1', 'Marion') returning id`,
      [SEED_ORG_ID, orgACaseTypeId],
    );
    expect(id).toBeTruthy();

    const fieldId = await getFieldId(db, SEED_ORG_ID, 'investigation', 'incident_overview', 'summary');
    const inserted = await db.query<{ id: string }>(
      `insert into public.case_field_values (case_id, field_id, value)
       values ($1, $2, to_jsonb('Written by an investigator'::text)) returning id`,
      [id, fieldId],
    );
    expect(inserted).toHaveLength(1);
  });

  it('cannot delete a case', async () => {
    await db.asUser(users.investigator);
    const rows = await db.query(`delete from public.cases where id = $1 returning id`, [orgACaseId]);
    expect(rows).toEqual([]);
  });

  it('cannot manage case type templates', async () => {
    await db.asUser(users.investigator);
    await expect(
      db.query(
        `insert into public.case_types (org_id, name, slug) values ($1, 'Sneaky', 'sneaky')`,
        [SEED_ORG_ID],
      ),
    ).rejects.toThrow(/row-level security/i);

    const renamed = await db.query(
      `update public.case_types set name = 'Renamed' where id = $1 returning id`,
      [orgACaseTypeId],
    );
    expect(renamed).toEqual([]);
  });
});

describe('approval transitions', () => {
  it('blocks an investigator from moving a case into an approval status', async () => {
    const approvedId = await getStatusId(db, SEED_ORG_ID, 'approved');
    await db.asUser(users.investigator);
    await expect(
      db.query(`update public.cases set status_id = $1 where id = $2`, [approvedId, orgACaseId]),
    ).rejects.toThrow(/requires the reviewer role/i);
  });

  it('allows an investigator to move a case through ordinary statuses', async () => {
    const openId = await getStatusId(db, SEED_ORG_ID, 'open');
    await db.asUser(users.investigator);
    const rows = await db.query<{ id: string }>(
      `update public.cases set status_id = $1 where id = $2 returning id`,
      [openId, orgACaseId],
    );
    expect(rows).toHaveLength(1);
  });

  it('allows a reviewer to approve', async () => {
    const approvedId = await getStatusId(db, SEED_ORG_ID, 'approved');
    await db.asUser(users.reviewer);
    const rows = await db.query<{ id: string }>(
      `update public.cases set status_id = $1 where id = $2 returning id`,
      [approvedId, orgACaseId],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('admin and super_admin', () => {
  it('lets an admin build a new case type end to end', async () => {
    await db.asUser(users.admin);
    const [{ id }] = await db.query<{ id: string }>(
      `select public.install_case_type_template($1, $2::jsonb) as id`,
      [SEED_ORG_ID, JSON.stringify({ name: 'Vehicle Theft', slug: 'vehicle-theft' })],
    );
    expect(id).toBeTruthy();

    const sections = await db.query<{ id: string }>(
      `insert into public.case_type_sections (case_type_id, key, label)
       values ($1, 'vehicle_details', 'Vehicle Details') returning id`,
      [id],
    );
    expect(sections).toHaveLength(1);
  });

  it('stops an admin from granting roles', async () => {
    await db.asUser(users.admin);
    await expect(
      db.query(
        `insert into public.user_roles (user_id, role_id, org_id)
         select $1, r.id, $2 from public.roles r where r.name = 'admin'`,
        [users.investigator, SEED_ORG_ID],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('lets a super_admin grant roles', async () => {
    await db.asUser(users.superAdmin);
    const rows = await db.query<{ id: string }>(
      `insert into public.user_roles (user_id, role_id, org_id)
       select $1, r.id, $2 from public.roles r where r.name = 'reviewer'
       returning id`,
      [users.otherInvestigator, SEED_ORG_ID],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('audit trail immutability', () => {
  it('cannot be edited or deleted by any client role', async () => {
    await db.asUser(users.superAdmin);
    const updated = await db.query(
      `update public.activity_logs set action = 'tampered' where org_id = $1 returning id`,
      [SEED_ORG_ID],
    );
    expect(updated).toEqual([]);

    const deleted = await db.query(
      `delete from public.activity_logs where org_id = $1 returning id`,
      [SEED_ORG_ID],
    );
    expect(deleted).toEqual([]);
  });

  it('cannot be written directly, only through log_activity', async () => {
    await db.asUser(users.investigator);
    await expect(
      db.query(
        `insert into public.activity_logs (org_id, action) values ($1, 'forged')`,
        [SEED_ORG_ID],
      ),
    ).rejects.toThrow(/row-level security/i);

    const rows = await db.query<{ log_activity: string }>(
      `select public.log_activity('report.exported', $1, $2, 'report', null, 'Exported PDF') as log_activity`,
      [SEED_ORG_ID, orgACaseId],
    );
    expect(rows[0].log_activity).toBeTruthy();
  });

  it('refuses log_activity for an org the caller does not belong to', async () => {
    await db.asUser(users.investigator);
    await expect(
      db.query(`select public.log_activity('sneaky', $1)`, [orgBId]),
    ).rejects.toThrow(/not_a_member_of_org/i);
  });
});

describe('saved views', () => {
  it('keeps personal views private and shared views visible', async () => {
    await db.asUser(users.investigator);
    await db.query(
      `insert into public.saved_views (org_id, user_id, name, filters)
       values ($1, $2, 'My open cases', '{"status":["open"]}'::jsonb)`,
      [SEED_ORG_ID, users.investigator],
    );

    await db.asUser(users.admin);
    const visible = await db.query<{ name: string }>(`select name from public.saved_views`);
    expect(visible.map((v) => v.name)).not.toContain('My open cases');

    await db.query(
      `insert into public.saved_views (org_id, user_id, name, is_shared, is_locked)
       values ($1, null, 'All approved cases', true, true)`,
      [SEED_ORG_ID],
    );

    await db.asUser(users.investigator);
    const forInvestigator = await db.query<{ name: string }>(
      `select name from public.saved_views order by name`,
    );
    expect(forInvestigator.map((v) => v.name)).toEqual(['All approved cases', 'My open cases']);

    const edited = await db.query(
      `update public.saved_views set name = 'Renamed' where is_locked returning id`,
    );
    expect(edited).toEqual([]);
  });
});

describe('admin notes', () => {
  it('only lets the author or an admin edit a note', async () => {
    await db.asUser(users.investigator);
    const [{ id }] = await db.query<{ id: string }>(
      `insert into public.admin_notes (case_id, author_id, body)
       values ($1, $2, 'Awaiting laboratory result') returning id`,
      [orgACaseId, users.investigator],
    );

    await db.asUser(users.otherInvestigator);
    const foreignEdit = await db.query(
      `update public.admin_notes set body = 'edited' where id = $1 returning id`,
      [id],
    );
    expect(foreignEdit).toEqual([]);

    await db.asUser(users.investigator);
    const ownEdit = await db.query(
      `update public.admin_notes set body = 'Laboratory result received' where id = $1 returning id`,
      [id],
    );
    expect(ownEdit).toHaveLength(1);

    await db.asUser(users.admin);
    const adminDelete = await db.query(`delete from public.admin_notes where id = $1 returning id`, [
      id,
    ]);
    expect(adminDelete).toHaveLength(1);
  });

  it('refuses a note attributed to someone else', async () => {
    await db.asUser(users.investigator);
    await expect(
      db.query(
        `insert into public.admin_notes (case_id, author_id, body) values ($1, $2, 'impersonated')`,
        [orgACaseId, users.reviewer],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('storage objects', () => {
  it('scopes case files to the owning org by path prefix', async () => {
    await db.asService();
    await db.query(
      `insert into storage.objects (bucket_id, name) values ('case-media', $1)`,
      [`${SEED_ORG_ID}/${orgACaseId}/scene-01.jpg`],
    );
    await db.query(
      `insert into storage.objects (bucket_id, name) values ('case-media', $1)`,
      [`${orgBId}/${orgBCaseId}/scene-01.jpg`],
    );

    await db.asUser(users.investigator);
    const visible = await db.query<{ name: string }>(`select name from storage.objects`);
    expect(visible).toHaveLength(1);
    expect(visible[0].name.startsWith(SEED_ORG_ID)).toBe(true);
  });

  it('stops a read_only user from uploading', async () => {
    await db.asUser(users.readOnly);
    await expect(
      db.query(`insert into storage.objects (bucket_id, name) values ('case-media', $1)`, [
        `${SEED_ORG_ID}/${orgACaseId}/sneaky.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('stops an investigator from uploading into another org’s folder', async () => {
    await db.asUser(users.investigator);
    await expect(
      db.query(`insert into storage.objects (bucket_id, name) values ('case-media', $1)`, [
        `${orgBId}/${orgBCaseId}/sneaky.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });
});
