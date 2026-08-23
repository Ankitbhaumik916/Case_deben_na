-- =============================================================================
-- 0013 STORAGE BUCKETS
-- -----------------------------------------------------------------------------
-- Path convention for every case bucket:  {org_id}/{case_id}/{file}
-- The first path segment is the tenant boundary, so one predicate secures the
-- whole bucket.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('case-media',   'case-media',   false),
  ('case-audio',   'case-audio',   false),
  ('case-reports', 'case-reports', false),
  ('org-assets',   'org-assets',   true)
on conflict (id) do nothing;

-- First path segment as a uuid, or null when the path is not org-scoped.
create or replace function public.storage_org_id(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.storage_org_id(text) to authenticated;

create policy "case files are readable by org members"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('case-media', 'case-audio', 'case-reports')
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "case files are writable by investigators"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('case-media', 'case-audio', 'case-reports')
    and public.can_write(public.storage_org_id(name))
  );

create policy "case files are updatable by investigators"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('case-media', 'case-audio', 'case-reports')
    and public.can_write(public.storage_org_id(name))
  )
  with check (
    bucket_id in ('case-media', 'case-audio', 'case-reports')
    and public.can_write(public.storage_org_id(name))
  );

create policy "case files are deletable by investigators"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('case-media', 'case-audio', 'case-reports')
    and public.can_write(public.storage_org_id(name))
  );

-- Org assets (logos, avatars) are world-readable but only admins may manage them.
create policy "org assets are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'org-assets');

create policy "org assets are managed by admins"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org-assets'
    and public.can_admin(public.storage_org_id(name))
  );

create policy "org assets are updatable by admins"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'org-assets'
    and public.can_admin(public.storage_org_id(name))
  );

create policy "org assets are deletable by admins"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'org-assets'
    and public.can_admin(public.storage_org_id(name))
  );
