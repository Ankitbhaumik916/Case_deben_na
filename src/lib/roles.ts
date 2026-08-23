/**
 * Role vocabulary, free of any server-only import so Client Components can use
 * it. Mirrors public.role_rank() in migration 0001.
 *
 * These helpers decide what to SHOW. They never decide what is ALLOWED —
 * authorisation is enforced by RLS in the database, so a user who forges past
 * the UI still gets nothing back.
 */
export const ROLE_RANK = {
  read_only: 1,
  investigator: 2,
  reviewer: 3,
  admin: 4,
  super_admin: 5,
} as const;

export type RoleName = keyof typeof ROLE_RANK;

export const ROLE_LABEL: Record<RoleName, string> = {
  read_only: 'Read only',
  investigator: 'Investigator',
  reviewer: 'Reviewer',
  admin: 'Administrator',
  super_admin: 'Super admin',
};

/** Matches can_write / can_review / can_admin / is_super_admin in the schema. */
export const can = {
  read: (rank: number) => rank >= ROLE_RANK.read_only,
  write: (rank: number) => rank >= ROLE_RANK.investigator,
  review: (rank: number) => rank >= ROLE_RANK.reviewer,
  admin: (rank: number) => rank >= ROLE_RANK.admin,
  manageUsers: (rank: number) => rank >= ROLE_RANK.super_admin,
};
