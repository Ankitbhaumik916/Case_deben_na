# Forensibus

Multi-tenant, no-code, multi-case-type forensic case management.

**The architectural rule:** case types are data, not code. Fire investigation,
burglary, homicide or any future discipline is added by an admin through the UI —
no new frontend or backend code. Nothing discipline-specific appears anywhere in
the schema or the application; it all lives in the `case_type_*` tables and is
rendered dynamically.

---

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Database schema, RLS, seed | **done** |
| 2 | Auth, portal shell, nav | **done** |
| — | Marketing landing page at `/` | **done** |
| 3 | Admin → Case Type Builder | **done** |
| 4 | Case list, filters, map, saved views | **done** (per-field filters deferred) |
| 5 | Case workspace — dynamic fields, autosave | **done** |
| 4–14 | See the build plan | not started |

---

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in from `supabase status`

npx supabase start                # local Postgres + Auth + Storage (needs Docker)
npm run db:reset                  # apply migrations + supabase/seed.sql
npm run seed:demo                 # demo accounts and cases (needs the service role key)
```

Demo accounts are created by `scripts/seed-demo.ts`, one per role
(`super_admin`, `admin`, `reviewer`, two `investigator`s, `read_only`), all with
the password in `SEED_DEMO_PASSWORD`.

### Adding accounts

An account grants nothing on its own. Access is account + org membership +
role, and only the last two open anything: every RLS policy keys off
`user_roles`, so an account with no role signs in successfully and lands on
"You are not a member of any organisation".

**Self-service registration** at `/signup` creates all three. While it is on,
anyone who can reach that page gets `SIGNUP_DEFAULT_ROLE` inside
`SIGNUP_ORG_SLUG` and can read that organisation's case files — fine for an open
demo, wrong for a real tenant:

| Variable | Default | Effect |
|---|---|---|
| `SIGNUP_ENABLED` | `true` | `false` closes registration; `/signup` shows a notice |
| `SIGNUP_DEFAULT_ROLE` | `investigator` | `read_only` is the safe choice for a public demo |
| `SIGNUP_ORG_SLUG` | the only org | required once a second organisation exists |

Registration uses the admin API with `email_confirm: true`, so there is no inbox
round trip — and therefore **no proof the address belongs to the person**. It
also cannot hide whether an address is already registered. Both are closed by
the invite flow in `/admin/users` (phase 13); until then, treat `/signup` as a
demo affordance.

**From the command line**, which works regardless of the switches above:

```bash
npm run user:create -- --email jo@agency.gov --name "Jo Mensah" --role investigator
npm run user:create -- --email jo@agency.gov --role admin --env .env.hosted.local
```

The script creates the auth user, links the profile to the organisation, and
grants the role — all three, in that order. Doing it by hand in the Supabase
dashboard covers only the first two; the missing `user_roles` row is why a
hand-made account appears to work and then shows an empty portal.

`/admin/users` (phase 12) replaces this with a proper invite flow.

### Verifying the database without Docker

The schema, its policies and the seed are tested against
[PGlite](https://pglite.dev) — Postgres compiled to WASM, running in-process —
with stand-ins for Supabase's `auth` and `storage` schemas. `auth.uid()` reads
`request.jwt.claims` exactly as the real one does, so RLS is exercised for real,
not approximated.

```bash
npm run db:validate    # migrations + seed + schema + RLS tests
npm test               # everything, against PGlite
```

`npm test` never touches the network. To verify a **deployed** project — real
accounts, real GoTrue JWTs, real PostgREST — run the opt-in suite:

```bash
npm run test:hosted    # writes to whatever .env.local points at, then cleans up
```

---

## Schema map

```
organizations ─┬─ users ── user_roles ── roles
               │
               ├─ case_types ─┬─ case_type_sections ── case_type_fields
               │              ├─ case_type_checklists ── checklist_items
               │              ├─ case_type_report_sections
               │              └─ case_statuses
               │
               └─ cases ─┬─ case_field_values      (one row per configured field)
                         ├─ case_people / case_investigators
                         ├─ case_section_status    (manual completion rule)
                         ├─ case_checklist_responses
                         ├─ evidence_items ── custody_events
                         ├─ media_files / media_log_reports
                         ├─ interviews
                         ├─ case_report_section_drafts
                         ├─ reports ── report_section_status
                         └─ admin_notes

activity_logs        append-only audit trail, written by database triggers
saved_views          personal and shared filter sets for the case list
retention_schedules  per org / per case type
```

### Conventions worth knowing before adding to it

- **Every table carries `org_id`.** Child rows inherit it from their parent via
  `public.inherit_org_id()`, and a composite foreign key on `(parent_id, org_id)`
  makes drift impossible. RLS is then a single predicate with no joins.
- **The role ladder** is `read_only(1) < investigator(2) < reviewer(3) <
  admin(4) < super_admin(5)`, evaluated by `SECURITY DEFINER` helpers
  (`can_write`, `can_review`, `can_admin`, …) so policies never recurse through
  `user_roles`.
- **Views are `security_invoker`.** A plain view runs as its owner and would
  leak every org.
- **The audit trail is written by triggers**, not by the client, and has a
  `SELECT` policy only — no client role can edit or erase it. Application events
  with no row behind them (exports, sign-ins) go through `public.log_activity()`.
- **A whole discipline is one JSON document.**
  `install_case_type_template(org_id, spec)` /
  `export_case_type_template(case_type_id)` / `duplicate_case_type(...)` are what
  the Case Type Builder uses to clone a type, and what `seed.sql` uses to install
  the two starter templates.

---

## Routes

One Next project, one deployable output.

| Route | Serves | Auth |
|---|---|---|
| `/` | marketing page (static, `public/landing/`) | public |
| `/login` | sign in | public; a signed-in visitor is bounced to `/portal` |
| `/signup` | self-service registration | public, and only while `SIGNUP_ENABLED` |
| `/portal` | the app home | required |
| `/cases` | case list (`?view=list\|map\|stats`) | required |
| `/cases/new` | case type picker, then create | investigator+ |
| `/cases/[id]` | case file (read-only until phase 5) | required |
| `/admin/case-types` | Case Type Builder | admin+ |
| `/cases`, `/pipeline`, … | later phases | required |

`middleware.ts` **must sit at `src/middleware.ts`**, not the repo root — with a
`src/` directory Next looks for it there and silently ignores a root-level one.
`next build` prints a `ƒ Middleware` line when it is wired up; if that line is
absent, route gating is not running and `requireUser()` in the `(app)` layout is
the only thing standing between a visitor and the app.

```bash
npm run verify:routes   # / -> Get Started -> /signup -> /login -> /portal
npm run verify:signup   # registration, roles, duplicates, audit; cleans up after itself
npm run verify:builder  # an admin builds a discipline, an investigator works a case of it
npm run verify:cases    # list, search, filters, stats, create flow, read-only gating
npm run verify:workspace # dynamic fields, autosave, completion, audit trail
```

## Design

The palette is deliberately near-monochrome — warm paper, deep ink chrome, one
brass accent — because **all saturated colour is reserved for case status**,
which is configured per organisation and rendered from `case_statuses.color`.
When nothing else in the interface is saturated, a status reads at a glance,
which is the entire job of the case list and the pipeline board. Every colour
resolves to a CSS variable in `src/app/globals.css`; re-skinning is a change to
that one block. Typeface is IBM Plex Sans, with IBM Plex Mono carrying every
identifier so case and evidence numbers align in a column.

## Layout

```
src/app/               App Router: (auth) sign-in, (app) authenticated shell
src/middleware.ts      session refresh + route gating (MUST live under src/)
src/lib/               supabase clients, auth/session, role vocabulary
src/components/        nav shell and UI primitives
public/landing/        static marketing page, rewritten onto /
supabase/migrations/   ordered schema (0001 … 0015)
supabase/seed.sql      organisation, statuses, two case type templates
scripts/seed-demo.ts   auth users and demo cases via the admin API
tests/                 schema + RLS suites, run against PGlite
```
