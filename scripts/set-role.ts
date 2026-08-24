/**
 * Change what an existing account may do.
 *
 *   npx tsx scripts/set-role.ts --email jo@agency.gov --role investigator
 *   npx tsx scripts/set-role.ts --email jo@agency.gov --role admin --env .env.hosted.local
 *   npx tsx scripts/set-role.ts --email jo@agency.gov --list
 *
 * Self-registration hands out SIGNUP_DEFAULT_ROLE, which should be the least
 * privileged thing that is useful — a stranger who finds /signup should not be
 * able to edit case records. Promoting a specific person afterwards is a
 * separate, deliberate act. This is that act, until /admin/users lands in
 * phase 13 and puts it behind a super_admin's login instead of a terminal.
 *
 * Replaces the account's roles in that organisation by default, because roles
 * accumulate otherwise and the effective permission is the highest one held —
 * so "demoting" someone by adding a lower role would do nothing at all.
 * Pass --add to grant alongside what is already there.
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const ROLES = ['read_only', 'investigator', 'reviewer', 'admin', 'super_admin'] as const;
type RoleName = (typeof ROLES)[number];

const RANK: Record<RoleName, number> = {
  read_only: 1,
  investigator: 2,
  reviewer: 3,
  admin: 4,
  super_admin: 5,
};

const CAN: Record<RoleName, string> = {
  read_only: 'read cases',
  investigator: 'read + create and edit cases, evidence, media, interviews',
  reviewer: 'all of investigator + approve and file cases',
  admin: 'all of reviewer + build case types',
  super_admin: 'all of admin + grant roles',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

loadEnv({ path: arg('env') ?? '.env.local' });
loadEnv();

const email = arg('email');
const role = arg('role') as RoleName | undefined;
const orgSlug = arg('org') ?? 'northgate';
const listOnly = has('list');
const add = has('add');

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!email) {
  die(
    'Missing --email.\n\n' +
      '  npx tsx scripts/set-role.ts --email jo@agency.gov --role investigator\n\n' +
      `  --role   ${ROLES.join(' | ')}\n` +
      '  --list   show current roles and change nothing\n' +
      '  --add    grant alongside existing roles instead of replacing them\n' +
      '  --org    organisation slug            (default: northgate)\n' +
      '  --env    env file                     (default: .env.local)',
  );
}
if (!listOnly && !role) die('Missing --role (or pass --list to just look).');
if (role && !ROLES.includes(role)) die(`Unknown role "${role}". One of: ${ROLES.join(', ')}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die('No Supabase credentials. Target the hosted project with --env .env.hosted.local');

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function rolesFor(userId: string, orgId: string): Promise<RoleName[]> {
  const { data } = await db
    .from('user_roles')
    .select('roles ( name )')
    .eq('user_id', userId)
    .eq('org_id', orgId);
  return (data ?? [])
    .map((r) => (r.roles as unknown as { name: string } | null)?.name)
    .filter((n): n is RoleName => !!n && ROLES.includes(n as RoleName));
}

function summarise(list: RoleName[]): string {
  if (!list.length) return '(none — the account can see nothing)';
  const top = list.slice().sort((a, b) => RANK[b] - RANK[a])[0];
  return `${list.slice().sort((a, b) => RANK[a] - RANK[b]).join(', ')}  ->  effectively ${top}: ${CAN[top]}`;
}

async function main(): Promise<void> {
  console.log(`\n→ ${url}`);

  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('slug', orgSlug)
    .maybeSingle();
  if (!org) die(`No organisation with slug "${orgSlug}".`);

  const { data: user } = await db
    .from('users')
    .select('id, email, full_name')
    .eq('email', email!.toLowerCase())
    .maybeSingle();
  if (!user) die(`No account for ${email}. Create one with scripts/create-user.ts.`);

  const before = await rolesFor(user.id as string, org.id as string);
  console.log(`→ ${user.full_name ?? user.email} in ${org.name}`);
  console.log(`  before: ${summarise(before)}`);

  if (listOnly) {
    console.log('');
    return;
  }

  if (!add) {
    // Roles accumulate and the highest wins, so replacing is what "set" must mean.
    const { error } = await db
      .from('user_roles')
      .delete()
      .eq('user_id', user.id as string)
      .eq('org_id', org.id as string);
    if (error) die(`Could not clear existing roles: ${error.message}`);
  }

  const { data: roleRow } = await db.from('roles').select('id').eq('name', role!).single();
  if (!roleRow) die(`Role "${role}" is missing from the roles table.`);

  const { error: grantError } = await db
    .from('user_roles')
    .upsert(
      { user_id: user.id as string, role_id: roleRow.id, org_id: org.id as string },
      { onConflict: 'user_id,role_id,org_id', ignoreDuplicates: true },
    );
  if (grantError) die(`Could not grant the role: ${grantError.message}`);

  const after = await rolesFor(user.id as string, org.id as string);
  console.log(`  after:  ${summarise(after)}`);
  console.log('\n  They need to sign out and back in for the change to take effect.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
