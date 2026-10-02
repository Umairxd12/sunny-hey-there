alter table public.skill_versions add column if not exists name text;
alter table public.skill_versions add column if not exists status text not null default 'inactive';
alter table public.skill_versions add column if not exists updated_at timestamptz not null default now();
update public.skill_versions v set name = coalesce(v.name, s.name), status = case when s.active_version_id = v.id and s.enabled then 'active' else 'inactive' end
  from public.skills s where s.id = v.skill_id;
create unique index if not exists skill_versions_one_active on public.skill_versions ((status)) where status = 'active';
create trigger skill_versions_touch before update on public.skill_versions for each row execute function public.touch_updated_at();

create or replace function public.validate_skill_version_status() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status not in ('active','inactive') then raise exception 'Invalid skill status %', new.status; end if;
  return new;
end $$;
create trigger skill_versions_status_check before insert or update on public.skill_versions for each row execute function public.validate_skill_version_status();

create or replace function public.activate_skill_version(_version_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  update public.skill_versions set status = 'inactive' where status = 'active' and id <> _version_id;
  update public.skill_versions set status = 'active' where id = _version_id;
  update public.skills s set active_version_id = _version_id, enabled = true from public.skill_versions v where v.id = _version_id and s.id = v.skill_id;
end $$;
revoke execute on function public.activate_skill_version(uuid) from public, anon;
grant execute on function public.activate_skill_version(uuid) to authenticated;

alter table public.projects add column if not exists visual_style text;
alter table public.projects add column if not exists language text not null default 'English';
alter table public.projects add column if not exists video_requirements text;
alter table public.projects add column if not exists current_stage text;
alter table public.projects add column if not exists last_error text;
update public.projects set status = upper(status) where status in ('draft');
update public.projects set status = 'META_PROMPT' where status = 'in_production';
alter table public.projects alter column status set default 'DRAFT';