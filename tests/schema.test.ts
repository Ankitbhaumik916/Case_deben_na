import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createTestDb, PUBLIC_TABLES, type TestDb } from './helpers/pglite-db';
import {
  SEED_ORG_ID,
  createCase,
  createUser,
  getCaseTypeId,
  getFieldId,
  getStatusId,
} from './helpers/fixtures';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

describe('migrations', () => {
  it('creates every expected table', async () => {
    const rows = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    for (const table of PUBLIC_TABLES) {
      expect(present, `missing table ${table}`).toContain(table);
    }
  });

  it('enables row level security on every table', async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const unprotected = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(unprotected).toEqual([]);
  });

  it('gives every table at least a select policy', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select distinct tablename from pg_policies where schemaname = 'public' and cmd = 'SELECT'`,
    );
    const withSelect = new Set(rows.map((r) => r.tablename));
    for (const table of PUBLIC_TABLES) {
      expect(withSelect, `no select policy on ${table}`).toContain(table);
    }
  });

  it('keeps the audit trail append-only', async () => {
    const rows = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'activity_logs'`,
    );
    expect(rows.map((r) => r.cmd)).toEqual(['SELECT']);
  });

  it('creates all views with security_invoker so caller RLS applies', async () => {
    const rows = await db.query<{ relname: string; reloptions: string[] | null }>(
      `select c.relname, c.reloptions
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const view of rows) {
      expect(view.reloptions ?? [], `${view.relname} is not security_invoker`).toContain(
        'security_invoker=true',
      );
    }
  });
});

describe('seed template', () => {
  it('installs two case types that share no code path', async () => {
    const rows = await db.query<{ slug: string; sections: number; fields: number }>(
      `select t.slug,
              (select count(*) from public.case_type_sections s where s.case_type_id = t.id)::int as sections,
              (select count(*) from public.case_type_fields f
                 join public.case_type_sections s on s.id = f.section_id
                where s.case_type_id = t.id)::int as fields
         from public.case_types t where t.org_id = $1 order by t.slug`,
      [SEED_ORG_ID],
    );
    expect(rows.map((r) => r.slug)).toEqual(['fire-investigation', 'investigation']);
    for (const row of rows) {
      expect(row.sections).toBeGreaterThan(0);
      expect(row.fields).toBeGreaterThan(0);
    }
  });

  it('derives the case detail tab bar from section groupings', async () => {
    const rows = await db.query<{ tab_key: string }>(
      `select distinct s.tab_key
         from public.case_type_sections s
         join public.case_types t on t.id = s.case_type_id
        where t.slug = 'fire-investigation' order by 1`,
    );
    expect(rows.map((r) => r.tab_key)).toEqual(['administration', 'documentation', 'interviews']);
  });

  it('lets one type carry its own statuses while the other inherits the org set', async () => {
    const fire = await db.query<{ key: string }>(
      `select s.key from public.case_statuses s
         join public.case_types t on t.id = s.case_type_id
        where t.slug = 'fire-investigation' order by s.sort_order`,
    );
    expect(fire.map((r) => r.key)).toEqual([
      'reported',
      'scene_exam',
      'lab_pending',
      'analysis',
      'peer_review',
      'final_report',
      'closed',
    ]);

    const inherited = await db.query<{ key: string }>(
      `select key from public.case_statuses
        where org_id = $1 and case_type_id is null order by sort_order`,
      [SEED_ORG_ID],
    );
    expect(inherited.map((r) => r.key)).toContain('draft');
  });

  it('resolves report section sources to real section ids', async () => {
    const [row] = await db.query<{ missing: number }>(
      `select count(*)::int as missing
         from public.case_type_report_sections rs
         cross join lateral jsonb_array_elements_text(rs.source_section_ids) sid
         left join public.case_type_sections s on s.id = sid.value::uuid
        where s.id is null`,
    );
    expect(row.missing).toBe(0);
  });
});

describe('template import / export', () => {
  it('round-trips a case type through export and duplicate', async () => {
    const sourceId = await getCaseTypeId(db, SEED_ORG_ID, 'fire-investigation');
    const [{ id: cloneId }] = await db.query<{ id: string }>(
      `select public.duplicate_case_type($1, 'Wildland Fire', 'wildland-fire') as id`,
      [sourceId],
    );

    const [{ source, clone }] = await db.query<{ source: unknown; clone: unknown }>(
      `select public.export_case_type_template($1) as source,
              public.export_case_type_template($2) as clone`,
      [sourceId, cloneId],
    );

    const normalise = (spec: Record<string, unknown>) => {
      const { name, slug, ...rest } = spec;
      return rest;
    };

    expect(normalise(clone as Record<string, unknown>)).toEqual(
      normalise(source as Record<string, unknown>),
    );

    await db.exec(`delete from public.case_types where id = '${cloneId}'`);
  });
});

describe('case lifecycle defaults', () => {
  it('applies the case type initial status, or the org default', async () => {
    const investigationId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const fireId = await getCaseTypeId(db, SEED_ORG_ID, 'fire-investigation');

    const generic = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: investigationId,
      caseNumber: 'DEF-001',
    });
    const fire = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: fireId,
      caseNumber: 'DEF-002',
    });

    const rows = await db.query<{ case_number: string; status_key: string }>(
      `select c.case_number, s.key as status_key
         from public.cases c join public.case_statuses s on s.id = c.status_id
        where c.id in ($1, $2) order by c.case_number`,
      [generic, fire],
    );
    expect(rows).toEqual([
      { case_number: 'DEF-001', status_key: 'draft' },
      { case_number: 'DEF-002', status_key: 'reported' },
    ]);
  });

  it('auto-increments report versions per case', async () => {
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'VER-001',
    });

    await db.query(`insert into public.reports (case_id) values ($1)`, [caseId]);
    await db.query(`insert into public.reports (case_id) values ($1)`, [caseId]);

    const rows = await db.query<{ version: number }>(
      `select version from public.reports where case_id = $1 order by version`,
      [caseId],
    );
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it('inherits org_id onto child rows from the parent case', async () => {
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'ORG-001',
    });

    await db.query(
      `insert into public.case_people (case_id, role, full_name) values ($1, 'witness', 'Dana Reyes')`,
      [caseId],
    );
    const [person] = await db.query<{ org_id: string }>(
      `select org_id from public.case_people where case_id = $1`,
      [caseId],
    );
    expect(person.org_id).toBe(SEED_ORG_ID);
  });
});

describe('chain of custody', () => {
  it('keeps the item headline in step with the newest ledger entry', async () => {
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'COC-001',
    });

    const [{ id: evidenceId }] = await db.query<{ id: string }>(
      `insert into public.evidence_items (case_id, item_number, description)
       values ($1, '001', 'Charred wiring segment') returning id`,
      [caseId],
    );

    await db.query(
      `insert into public.custody_events (evidence_id, event_type, actor_name, location, occurred_at)
       values ($1, 'collected', 'A. Bhaumik', 'Scene', now() - interval '2 days')`,
      [evidenceId],
    );
    await db.query(
      `insert into public.custody_events (evidence_id, event_type, actor_name, location, occurred_at)
       values ($1, 'transferred', 'Lab intake', 'Regional Laboratory', now() - interval '1 day')`,
      [evidenceId],
    );

    const [item] = await db.query<{ current_status: string; current_location: string }>(
      `select current_status, current_location from public.evidence_items where id = $1`,
      [evidenceId],
    );
    expect(item.current_status).toBe('transferred');
    expect(item.current_location).toBe('Regional Laboratory');
  });
});

describe('full text search', () => {
  it('finds a case by a person name and by a dynamic field value', async () => {
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'SRCH-001',
      address: '44 Kestrel Lane',
      county: 'Marion',
    });

    await db.query(
      `insert into public.case_people (case_id, role, full_name) values ($1, 'witness', 'Marguerite Okonkwo')`,
      [caseId],
    );

    const fieldId = await getFieldId(db, SEED_ORG_ID, 'investigation', 'incident_overview', 'summary');
    await db.query(
      `insert into public.case_field_values (case_id, field_id, value)
       values ($1, $2, to_jsonb('Suspected tampering with the perimeter fencing'::text))`,
      [caseId, fieldId],
    );

    const byPerson = await db.query<{ id: string }>(
      `select id from public.cases where search_tsv @@ plainto_tsquery('english', 'Okonkwo')`,
    );
    expect(byPerson.map((r) => r.id)).toContain(caseId);

    const byField = await db.query<{ id: string }>(
      `select id from public.cases where search_tsv @@ plainto_tsquery('english', 'perimeter fencing')`,
    );
    expect(byField.map((r) => r.id)).toContain(caseId);

    const byAddress = await db.query<{ id: string }>(
      `select id from public.cases where search_tsv @@ plainto_tsquery('english', 'Kestrel')`,
    );
    expect(byAddress.map((r) => r.id)).toContain(caseId);
  });
});

describe('section completion', () => {
  it('reports filled and required counts per section', async () => {
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'COMP-001',
    });

    const before = await db.query<{ filled_fields: number }>(
      `select filled_fields::int from public.case_section_completion
        where case_id = $1 and section_key = 'incident_overview'`,
      [caseId],
    );
    expect(before[0].filled_fields).toBe(0);

    const fieldId = await getFieldId(db, SEED_ORG_ID, 'investigation', 'incident_overview', 'summary');
    await db.query(
      `insert into public.case_field_values (case_id, field_id, value)
       values ($1, $2, to_jsonb('A filled summary'::text))`,
      [caseId, fieldId],
    );

    const [after] = await db.query<{
      filled_fields: number;
      required_fields: number;
      filled_required_fields: number;
    }>(
      `select filled_fields::int, required_fields::int, filled_required_fields::int
         from public.case_section_completion
        where case_id = $1 and section_key = 'incident_overview'`,
      [caseId],
    );
    expect(after.filled_fields).toBe(1);
    expect(after.required_fields).toBe(3);
    expect(after.filled_required_fields).toBe(1);
  });

  it('treats blank strings and empty arrays as unfilled', async () => {
    const rows = await db.query<{ blank: boolean; empty_array: boolean; zero: boolean }>(
      `select public.jsonb_is_filled(to_jsonb('   '::text)) as blank,
              public.jsonb_is_filled('[]'::jsonb) as empty_array,
              public.jsonb_is_filled(to_jsonb(0)) as zero`,
    );
    expect(rows[0]).toEqual({ blank: false, empty_array: false, zero: true });
  });
});

describe('audit trail', () => {
  it('logs case creation, field edits and status changes without app help', async () => {
    const actorId = await createUser(db, {
      orgId: SEED_ORG_ID,
      email: 'audit.actor@northgate.test',
      role: 'reviewer',
      fullName: 'Audit Actor',
    });
    await db.asUser(actorId);

    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const [{ id: caseId }] = await db.query<{ id: string }>(
      `insert into public.cases (org_id, case_type_id, case_number, address)
       values ($1, $2, 'AUD-001', '9 Bellweather Road') returning id`,
      [SEED_ORG_ID, typeId],
    );

    const fieldId = await getFieldId(db, SEED_ORG_ID, 'investigation', 'findings', 'findings_narrative');
    await db.query(
      `insert into public.case_field_values (case_id, field_id, value)
       values ($1, $2, to_jsonb('Initial findings'::text))`,
      [caseId, fieldId],
    );

    const approvedId = await getStatusId(db, SEED_ORG_ID, 'approved');
    await db.query(`update public.cases set status_id = $1 where id = $2`, [approvedId, caseId]);

    await db.asService();
    const rows = await db.query<{ action: string; actor_id: string | null }>(
      `select action, actor_id from public.activity_logs
        where case_id = $1 order by created_at, action`,
      [caseId],
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('case.created');
    expect(actions).toContain('field_value.created');
    expect(actions).toContain('case.status_changed');
    for (const row of rows) {
      expect(row.actor_id).toBe(actorId);
    }

    const [statusChange] = await db.query<{ metadata: Record<string, unknown> }>(
      `select metadata from public.activity_logs
        where case_id = $1 and action = 'case.status_changed'`,
      [caseId],
    );
    expect(statusChange.metadata).toMatchObject({ from_status: 'Draft', to_status: 'Approved' });
  });

  it('does not log a row when only the search document is refreshed', async () => {
    await db.asService();
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'NOISE-001',
    });

    const before = await db.query<{ count: number }>(
      `select count(*)::int from public.activity_logs where case_id = $1`,
      [caseId],
    );

    await db.query(
      `insert into public.case_people (case_id, role, full_name) values ($1, 'witness', 'Quiet Witness')`,
      [caseId],
    );

    const after = await db.query<{ count: number }>(
      `select count(*)::int from public.activity_logs
        where case_id = $1 and target_type = 'case'`,
      [caseId],
    );
    const beforeCaseRows = before[0].count;
    expect(after[0].count).toBeLessThanOrEqual(beforeCaseRows);
  });
});

describe('case deletion', () => {
  it('deletes a case that has child rows, and keeps the audit trail', async () => {
    // Regression: the child tables' AFTER DELETE audit triggers used to insert
    // activity_logs rows referencing the case being removed in the same
    // statement, so any case with real data on it could not be deleted.
    await db.asService();
    const typeId = await getCaseTypeId(db, SEED_ORG_ID, 'investigation');
    const caseId = await createCase(db, {
      orgId: SEED_ORG_ID,
      caseTypeId: typeId,
      caseNumber: 'DEL-001',
    });

    const fieldId = await getFieldId(db, SEED_ORG_ID, 'investigation', 'incident_overview', 'summary');
    await db.query(
      `insert into public.case_field_values (case_id, field_id, value)
       values ($1, $2, to_jsonb('doomed'::text))`,
      [caseId, fieldId],
    );
    await db.query(
      `insert into public.case_people (case_id, role, full_name) values ($1, 'witness', 'Doomed Witness')`,
      [caseId],
    );
    const [{ id: evidenceId }] = await db.query<{ id: string }>(
      `insert into public.evidence_items (case_id, item_number, description)
       values ($1, '001', 'Doomed item') returning id`,
      [caseId],
    );
    await db.query(
      `insert into public.custody_events (evidence_id, event_type, actor_name)
       values ($1, 'collected', 'Someone')`,
      [evidenceId],
    );
    await db.query(
      `insert into public.interviews (case_id, subject_name) values ($1, 'Doomed Subject')`,
      [caseId],
    );

    const deleted = await db.query<{ id: string }>(
      `delete from public.cases where id = $1 returning id`,
      [caseId],
    );
    expect(deleted).toHaveLength(1);

    const [remaining] = await db.query<{ count: number }>(
      `select count(*)::int from public.cases where id = $1`,
      [caseId],
    );
    expect(remaining.count).toBe(0);

    // The trail survives the record it describes.
    const logs = await db.query<{ action: string }>(
      `select action from public.activity_logs where case_id = $1`,
      [caseId],
    );
    expect(logs.map((r) => r.action)).toContain('case.deleted');
  });
});
