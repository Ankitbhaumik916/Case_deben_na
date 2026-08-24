/**
 * Exercises registration against whatever .env.local points at.
 *
 *   npm run verify:signup
 *
 * Drives lib/signup.ts directly — the same function the Server Action calls —
 * then signs in as the account it made to prove the role actually landed.
 * Everything it creates is deleted at the end.
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

loadEnv({ path: arg('env') ?? '.env.local' });
loadEnv();

const { provisionAccount } = await import('../src/lib/signup');

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const probeEmail = `signup.probe.${Date.now()}@northgate.test`;
const probePassword = 'probe-password-9f2a';

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

async function cleanup() {
  const { data } = await admin.from('users').select('id').eq('email', probeEmail).maybeSingle();
  if (data) await admin.auth.admin.deleteUser(data.id as string);
}

async function main() {
  console.log(`\n→ ${URL_}\n`);

  console.log('INPUT VALIDATION');
  const short = await provisionAccount({
    fullName: 'Probe',
    email: probeEmail,
    password: 'short',
  });
  check(!short.ok, 'a 5-character password is refused', short.ok ? '' : short.error);

  const badEmail = await provisionAccount({
    fullName: 'Probe',
    email: 'not-an-email',
    password: probePassword,
  });
  check(!badEmail.ok, 'a malformed email is refused', badEmail.ok ? '' : badEmail.error);

  const noName = await provisionAccount({ fullName: 'x', email: probeEmail, password: probePassword });
  check(!noName.ok, 'a one-character name is refused', noName.ok ? '' : noName.error);

  console.log('\nPROVISIONING');
  const created = await provisionAccount({
    fullName: 'Signup Probe',
    email: probeEmail,
    password: probePassword,
  });
  check(created.ok, 'a valid registration succeeds', created.ok ? created.email : created.error);
  if (!created.ok) {
    await cleanup();
    process.exit(1);
  }

  const { data: profile } = await admin
    .from('users')
    .select('id, org_id, full_name')
    .eq('email', probeEmail)
    .single();
  check(!!profile?.org_id, 'the profile is linked to an organisation');
  check(profile?.full_name === 'Signup Probe', 'the name was saved', String(profile?.full_name));

  const { data: grants } = await admin
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', profile!.id as string);
  const roleNames = (grants ?? []).map((g) => (g.roles as unknown as { name: string })?.name);
  check(roleNames.length === 1, 'exactly one role was granted', roleNames.join(', '));

  console.log('\nDUPLICATES');
  const again = await provisionAccount({
    fullName: 'Signup Probe',
    email: probeEmail,
    password: probePassword,
  });
  check(!again.ok, 'registering the same address twice is refused');
  // Instant registration inherently discloses that an address is taken; what it
  // must not do is echo the address back or name the account holder.
  check(
    !again.ok && !again.error.includes(probeEmail) && !/Signup Probe/.test(again.error),
    'and the refusal does not echo the address or the account holder',
    again.ok ? '' : again.error,
  );

  console.log('\nWHAT THE NEW ACCOUNT CAN ACTUALLY SEE');
  const asUser = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await asUser.auth.signInWithPassword({
    email: probeEmail,
    password: probePassword,
  });
  check(!signInError, 'it can sign in', signInError?.message ?? '');

  const { data: types } = await asUser.from('case_types').select('slug');
  check((types ?? []).length > 0, 'it sees the case types', (types ?? []).map((t) => t.slug).join(', '));

  const { data: cases } = await asUser.from('cases').select('case_number');
  check((cases ?? []).length > 0, 'it sees cases', `${(cases ?? []).length} case(s)`);

  const { error: adminAttempt } = await asUser
    .from('case_types')
    .insert({ org_id: profile!.org_id as string, name: 'Sneaky', slug: `sneaky-${Date.now()}` });
  check(
    !!adminAttempt,
    'but it cannot create case types (not an admin)',
    adminAttempt?.code ?? 'NO ERROR — role is too privileged',
  );

  console.log('\nAUDIT');
  const { data: logs } = await admin
    .from('activity_logs')
    .select('action')
    .eq('target_id', profile!.id as string);
  check(
    (logs ?? []).some((l) => l.action === 'user.registered'),
    'the registration was written to the audit trail',
  );

  console.log('\nCLEANUP');
  await cleanup();
  const { data: gone } = await admin
    .from('users')
    .select('id')
    .eq('email', probeEmail)
    .maybeSingle();
  check(!gone, 'the probe account was removed');

  console.log('\n' + (failures === 0 ? 'SIGNUP: all checks passed' : `SIGNUP: ${failures} FAILED`));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
