/**
 * Create an account and put it inside an organisation.
 *
 *   npx tsx scripts/create-user.ts --email jo@agency.gov --name "Jo Mensah" --role investigator
 *   npx tsx scripts/create-user.ts --email jo@agency.gov --role admin --env .env.hosted.local
 *
 * There is deliberately no sign-up button in the product. Access to a case file
 * is account + org membership + role, and only the last two actually grant
 * anything: RLS keys every policy off public.user_roles, so an account with no
 * role sees nothing at all. Letting a stranger self-register into a forensic
 * case system is not a feature.
 *
 * This does all three steps in the right order:
 *   1. create the auth user (email pre-confirmed, so no inbox round trip)
 *   2. fill in the public.users profile with its home org
 *   3. grant the role in public.user_roles
 *
 * Step 3 is the one people forget doing this by hand in the dashboard — without
 * it the account signs in fine and lands on "You are not a member of any
 * organisation".
 *
 * Replaced by the invite flow in /admin/users when phase 12 lands.
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const ROLES = ['read_only', 'investigator', 'reviewer', 'admin', 'super_admin'] as const;
type RoleName = (typeof ROLES)[number];

// ---------------------------------------------------------------- arguments
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const envFile = arg('env') ?? '.env.local';
loadEnv({ path: envFile });
loadEnv();

const email = arg('email');
const fullName = arg('name');
const role = (arg('role') ?? 'investigator') as RoleName;
const orgSlug = arg('org') ?? 'northgate';
const jobTitle = arg('title');
const password = arg('password') ?? randomBytes(12).toString('base64url');

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!email) {
  die(
    'Missing --email.\n\n' +
      '  npx tsx scripts/create-user.ts --email jo@agency.gov --name "Jo Mensah" --role investigator\n\n' +
      `  --role      ${ROLES.join(' | ')}   (default: investigator)\n` +
      '  --org       organisation slug                     (default: northgate)\n' +
      '  --password  omit to generate one\n' +
      '  --env       env file to read                      (default: .env.local)\n' +
      '  --title     job title, optional',
  );
}

if (!ROLES.includes(role)) {
  die(`Unknown role "${role}". One of: ${ROLES.join(', ')}`);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  die(
    `No Supabase credentials in ${envFile}.\n` +
      '  Target the hosted project with:  --env .env.hosted.local',
  );
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main(): Promise<void> {
  console.log(`\n→ ${url}`);

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, name')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (orgError) die(`Could not read organisations: ${orgError.message}`);
  if (!org) die(`No organisation with slug "${orgSlug}". Run the seed first.`);

  const orgId = org.id as string;
  console.log(`→ organisation: ${org.name}`);

  // ---- 1. the account -------------------------------------------------
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('email', email!)
    .maybeSingle();

  let userId = existing?.id as string | undefined;
  let created = false;

  if (userId) {
    console.log(`· account already exists, updating its org and role`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: email!,
      password,
      email_confirm: true, // skip the confirmation email
      user_metadata: { full_name: fullName ?? email, org_id: orgId },
    });
    if (error || !data?.user) die(`Could not create the account: ${error?.message}`);
    userId = data.user.id;
    created = true;
    console.log(`✓ account created`);
  }

  // ---- 2. the profile -------------------------------------------------
  // handle_new_user() already inserted the row from the signup metadata; this
  // fills in anything the trigger could not know.
  const { error: profileError } = await db
    .from('users')
    .update({
      org_id: orgId,
      full_name: fullName ?? undefined,
      job_title: jobTitle ?? undefined,
      is_active: true,
    })
    .eq('id', userId!);
  if (profileError) die(`Could not update the profile: ${profileError.message}`);
  console.log(`✓ profile linked to ${org.name}`);

  // ---- 3. the role — the part that actually grants access --------------
  const { data: roleRow } = await db.from('roles').select('id').eq('name', role).single();
  if (!roleRow) die(`Role "${role}" is missing from the roles table.`);

  const { error: grantError } = await db
    .from('user_roles')
    .upsert(
      { user_id: userId!, role_id: roleRow.id, org_id: orgId },
      { onConflict: 'user_id,role_id,org_id', ignoreDuplicates: true },
    );
  if (grantError) die(`Could not grant the role: ${grantError.message}`);
  console.log(`✓ granted "${role}"`);

  console.log('\n─────────────────────────────────────────────');
  console.log(`  email     ${email}`);
  if (created) {
    console.log(`  password  ${password}`);
    console.log('\n  Share this over something other than email, and have');
    console.log('  them change it after the first sign-in.');
  } else {
    console.log('  password  unchanged');
  }
  console.log('─────────────────────────────────────────────\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
