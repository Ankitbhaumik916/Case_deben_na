import type { RoleName } from '@/lib/roles';

/**
 * Registration settings. Kept out of the 'use server' action file because a
 * Server Actions module may only export async functions, and the signup page
 * needs to read these synchronously to decide what to render.
 *
 * Server-only: these are unprefixed env vars, so never import this from a
 * Client Component.
 */

export const SIGNUP_ROLES: RoleName[] = [
  'read_only',
  'investigator',
  'reviewer',
  'admin',
  'super_admin',
];

/** Registration is on unless explicitly closed. */
export function signupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED !== 'false';
}

/** Role handed to a self-registered account. */
export function signupDefaultRole(): RoleName {
  const configured = process.env.SIGNUP_DEFAULT_ROLE as RoleName | undefined;
  return configured && SIGNUP_ROLES.includes(configured) ? configured : 'investigator';
}

/** Organisation new accounts join. Optional while only one org exists. */
export function signupOrgSlug(): string | undefined {
  return process.env.SIGNUP_ORG_SLUG || undefined;
}
