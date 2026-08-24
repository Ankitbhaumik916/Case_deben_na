import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { signupDefaultRole, signupEnabled, signupOrgSlug } from '@/lib/signup-config';

/**
 * Self-service registration, as a plain function.
 *
 * READ THIS BEFORE LEAVING IT ON IN PRODUCTION.
 *
 * An account on its own grants nothing — every RLS policy keys off
 * public.user_roles — so registration is only useful if it also puts the new
 * account into an organisation with a role. Which means: while this is enabled,
 * anyone who can reach /signup gets whatever SIGNUP_DEFAULT_ROLE says inside
 * SIGNUP_ORG_SLUG, and can then read that organisation's case files.
 *
 * That is a deliberate trade for an open demo, not a default to ship to a real
 * tenant. Two switches:
 *
 *   SIGNUP_ENABLED=false            close registration entirely
 *   SIGNUP_DEFAULT_ROLE=read_only   hand out the least-privileged role instead
 *
 * The proper answer is the admin invite flow in /admin/users (phase 13), where
 * an existing super_admin decides who joins and at what level.
 *
 * Deliberately free of next/headers so scripts/verify-signup.ts can drive it
 * directly; the thin 'use server' wrapper lives in lib/actions/signup.ts.
 */

const SignupInput = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters.')
    .max(200, 'That password is too long.'),
});

export type SignupResult = { ok: true; email: string } | { ok: false; error: string };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials are not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function provisionAccount(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<SignupResult> {
  if (!signupEnabled()) {
    return { ok: false, error: 'Registration is closed. Ask an administrator for an invitation.' };
  }

  const parsed = SignupInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const { fullName, email, password } = parsed.data;
  const admin = adminClient();

  // ---- which organisation does a new account join? ----
  const slug = signupOrgSlug();
  const query = admin.from('organizations').select('id, name, slug');
  const { data: orgs, error: orgError } = slug ? await query.eq('slug', slug) : await query;

  if (orgError) {
    return { ok: false, error: 'Could not reach the directory. Try again in a moment.' };
  }
  if (!orgs?.length) {
    return {
      ok: false,
      error: slug
        ? `No organisation "${slug}" exists.`
        : 'No organisation has been set up yet.',
    };
  }
  if (orgs.length > 1) {
    // Ambiguous on purpose: silently picking one would put someone in the
    // wrong tenant's case files.
    return {
      ok: false,
      error: 'Registration is not configured: set SIGNUP_ORG_SLUG to name the organisation.',
    };
  }

  const org = orgs[0];

  // ---- does the account already exist? ----
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    // Be honest about the trade here: instant registration cannot hide whether
    // an address is already registered. Submitting a fresh address succeeds and
    // submitting a known one fails, which is an enumeration oracle no matter
    // how the message is worded. Closing it properly means the
    // "check your inbox" pattern — always answer identically and send either a
    // confirmation or a "you already have an account" mail — which needs SMTP
    // configured on the project. Until then the message at least stays vague
    // about the account and never echoes the submitted address back.
    return {
      ok: false,
      error: 'That email address cannot be used to register. Sign in instead, or contact an administrator.',
    };
  }

  // ---- 1. the account ----
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // No inbox round trip. The trade is that the address is unverified — see
    // the note in the README before relying on it for anything.
    email_confirm: true,
    user_metadata: { full_name: fullName, org_id: org.id },
  });

  if (createError || !created?.user) {
    return { ok: false, error: createError?.message ?? 'Could not create the account.' };
  }

  const userId = created.user.id;

  // ---- 2. the profile (handle_new_user already inserted the row) ----
  await admin.from('users').update({ org_id: org.id, full_name: fullName }).eq('id', userId);

  // ---- 3. the role — the step that actually grants access ----
  const role = signupDefaultRole();
  const { data: roleRow } = await admin.from('roles').select('id').eq('name', role).single();

  if (!roleRow) {
    // Leave no half-provisioned account behind.
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: 'Registration is misconfigured: the role table is empty.' };
  }

  const { error: grantError } = await admin
    .from('user_roles')
    .insert({ user_id: userId, role_id: roleRow.id, org_id: org.id });

  if (grantError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: 'Could not finish setting up the account. Nothing was saved.' };
  }

  await admin.rpc('log_activity', {
    p_action: 'user.registered',
    p_org_id: org.id,
    p_target_type: 'user',
    p_target_id: userId,
    p_summary: `${fullName} registered as ${role}`,
  });

  return { ok: true, email };
}
