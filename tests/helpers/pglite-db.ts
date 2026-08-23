import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const SEED_FILE = path.join(ROOT, 'supabase', 'seed.sql');

/**
 * Minimal stand-ins for the pieces of a Supabase instance that live outside our
 * migrations: the auth and storage schemas, the three API roles, and
 * auth.uid(). auth.uid() reads request.jwt.claims exactly as the real one does,
 * so RLS behaves here the way it will in production.
 */
const SUPABASE_SHIM = /* sql */ `
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;

  create role anon          nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role  nologin noinherit bypassrls;

  grant usage on schema public  to anon, authenticated, service_role;
  grant usage on schema auth    to anon, authenticated, service_role;
  grant usage on schema storage to anon, authenticated, service_role;

  create table auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique,
    encrypted_password text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now()
  );

  create or replace function auth.jwt()
  returns jsonb language sql stable as $shim$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    );
  $shim$;

  create or replace function auth.uid()
  returns uuid language sql stable as $shim$
    select nullif(auth.jwt() ->> 'sub', '')::uuid;
  $shim$;

  create or replace function auth.role()
  returns text language sql stable as $shim$
    select auth.jwt() ->> 'role';
  $shim$;

  create table storage.buckets (
    id         text primary key,
    name       text not null,
    public     boolean not null default false,
    created_at timestamptz not null default now()
  );

  create table storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text references storage.buckets (id),
    name       text not null,
    owner      uuid,
    metadata   jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  alter table storage.objects enable row level security;

  create or replace function storage.foldername(p_name text)
  returns text[] language sql immutable as $shim$
    select string_to_array(p_name, '/');
  $shim$;

  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.objects to anon;
  grant all on storage.objects, storage.buckets to service_role;
`;

export interface TestDb {
  raw: PGlite;
  /** Run SQL and return typed rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements, ignoring the result. */
  exec(sql: string): Promise<void>;
  /** Act as an authenticated end user (RLS enforced, auth.uid() = userId). */
  asUser(userId: string): Promise<void>;
  /** Act as the anon role (no session). */
  asAnon(): Promise<void>;
  /** Act as the superuser used by migrations and server-side jobs (RLS bypassed). */
  asService(): Promise<void>;
  close(): Promise<void>;
}

export async function listMigrations(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

export interface CreateTestDbOptions {
  /** Apply supabase/seed.sql after the migrations. Defaults to true. */
  seed?: boolean;
}

export async function createTestDb(options: CreateTestDbOptions = {}): Promise<TestDb> {
  const { seed = true } = options;
  const pg = new PGlite();
  await pg.waitReady;

  await pg.exec(SUPABASE_SHIM);

  for (const file of await listMigrations()) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await pg.exec(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }

  if (seed) {
    const sql = await readFile(SEED_FILE, 'utf8');
    try {
      await pg.exec(sql);
    } catch (error) {
      throw new Error(`seed.sql failed: ${(error as Error).message}`);
    }
  }

  const db: TestDb = {
    raw: pg,
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const result = await pg.query<T>(sql, params as never[]);
      return result.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async asUser(userId: string) {
      await pg.exec('reset role;');
      await pg.query('select set_config($1, $2, false)', [
        'request.jwt.claims',
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ] as never[]);
      await pg.exec('set role authenticated;');
    },
    async asAnon() {
      await pg.exec('reset role;');
      await pg.query('select set_config($1, $2, false)', ['request.jwt.claims', ''] as never[]);
      await pg.exec('set role anon;');
    },
    async asService() {
      await pg.exec('reset role;');
      await pg.query('select set_config($1, $2, false)', ['request.jwt.claims', ''] as never[]);
    },
    async close() {
      await pg.close();
    },
  };

  return db;
}

/** Table name of every base table we expect RLS on. */
export const PUBLIC_TABLES = [
  'organizations',
  'users',
  'roles',
  'user_roles',
  'case_types',
  'case_type_sections',
  'case_type_fields',
  'case_statuses',
  'case_type_checklists',
  'checklist_items',
  'case_type_report_sections',
  'cases',
  'case_field_values',
  'case_people',
  'case_investigators',
  'case_section_status',
  'case_checklist_responses',
  'saved_views',
  'evidence_items',
  'custody_events',
  'media_files',
  'media_log_reports',
  'interviews',
  'case_report_section_drafts',
  'reports',
  'report_section_status',
  'admin_notes',
  'retention_schedules',
  'activity_logs',
] as const;
