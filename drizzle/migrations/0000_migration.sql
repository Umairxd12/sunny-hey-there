create type public.app_role as enum ('admin','user');
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create table public.profiles (id uuid primary key, display_name text, created_at timestamptz not null default now());
grant select, update on public.profiles to authenticated; grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at = now(); return new; end $$;

create table public.skills (id uuid primary key default gen_random_uuid(), name text not null, description text, enabled boolean not null default true, active_version_id uuid, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.skill_versions (id uuid primary key default gen_random_uuid(), skill_id uuid not null references public.skills(id) on delete cascade, version int not null, file_name text not null, storage_path text, content text not null, size_bytes int not null default 0, notes text, created_by uuid, created_at timestamptz not null default now(), unique(skill_id, version));
alter table public.skills add constraint skills_active_fk foreign key (active_version_id) references public.skill_versions(id) on delete set null;
grant select, insert, update, delete on public.skills, public.skill_versions to authenticated; grant all on public.skills, public.skill_versions to service_role;
alter table public.skills enable row level security; alter table public.skill_versions enable row level security;
create policy "admin all skills" on public.skills for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin all versions" on public.skill_versions for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger skills_touch before update on public.skills for each row execute function public.touch_updated_at();

create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), title text not null, idea text not null, target_duration_seconds int not null default 30, aspect_ratio text not null default '9:16', status text not null default 'draft', skill_version_id uuid references public.skill_versions(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create table public.pipeline_steps (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, user_id uuid not null default auth.uid(), step_key text not null, status text not null default 'pending', output text, error text, model text, started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now(), unique(project_id, step_key));
create table public.characters (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), project_id uuid references public.projects(id) on delete cascade, name text not null, description text, created_at timestamptz not null default now());
create table public.storyboards (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), project_id uuid not null references public.projects(id) on delete cascade, content text not null, created_at timestamptz not null default now());
create table public.videos (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), project_id uuid references public.projects(id) on delete cascade, provider text, provider_job_id text, status text not null default 'queued', video_url text, created_at timestamptz not null default now());
create table public.social_accounts (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), platform text not null, account_name text, status text not null default 'disconnected', created_at timestamptz not null default now());
create table public.scheduled_posts (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), project_id uuid references public.projects(id) on delete cascade, video_id uuid references public.videos(id) on delete set null, platform text not null, title text, caption text, hashtags text, scheduled_for timestamptz, status text not null default 'draft', external_post_id text, created_at timestamptz not null default now());
create table public.post_metrics (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), post_id uuid not null references public.scheduled_posts(id) on delete cascade, views int default 0, likes int default 0, comments int default 0, shares int default 0, collected_at timestamptz not null default now());

do $$ declare t text; begin
  foreach t in array array['projects','pipeline_steps','characters','storyboards','videos','social_accounts','scheduled_posts','post_metrics'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop; end $$;