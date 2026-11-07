

-- ── 1. Owner table ────────────────────────────────────────────
create table if not exists public.owners (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.owners enable row level security;

drop policy if exists "owner reads own row" on public.owners;
create policy "owner reads own row"
  on public.owners for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.owners where user_id = auth.uid());
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- ── 2. Content tables ─────────────────────────────────────────
create table if not exists public.units (
  id serial primary key,
  slug text not null unique,
  name text not null,
  has_practicals boolean not null default false,
  sort integer not null default 0,
  is_published boolean not null default true
);

create table if not exists public.marks (
  id uuid primary key default gen_random_uuid(),
  unit_id integer not null references public.units (id) on delete cascade,
  kind text not null check (kind in ('CAT', 'Exam')),
  assessment_name text not null check (char_length(assessment_name) between 1 and 120),
  marks_obtained numeric not null check (marks_obtained >= 0),
  total_marks numeric not null check (total_marks > 0),
  sort integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  check (marks_obtained <= total_marks)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  unit_id integer not null references public.units (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  sort integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null unique,
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  sort integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);


insert into public.units (slug, name, has_practicals, sort) values
  ('apply-engineering-mathematics', 'Apply Engineering Mathematics', false, 1),
  ('apply-thermodynamics-fluid-mechanic-principles', 'Apply Thermodynamics & Fluid Mechanic Principles', false, 2),
  ('electromechanical-systems-design', 'Electromechanical Systems Design', true, 3),
  ('communication-skills', 'Communication Skills', false, 4),
  ('electromechanical-system-installation-maintenance', 'Electromechanical System Installation & Maintenance', true, 5),
  ('computer-aided-design', 'Computer Aided Design', true, 6)
on conflict (slug) do nothing;

-- ── 3. Row Level Security ─────────────────────────────────────
alter table public.units         enable row level security;
alter table public.marks         enable row level security;
alter table public.projects      enable row level security;
alter table public.project_media enable row level security;

-- units
drop policy if exists "read published units" on public.units;
create policy "read published units" on public.units for select
  to anon, authenticated
  using (is_published or public.is_owner());

drop policy if exists "owner insert units" on public.units;
create policy "owner insert units" on public.units for insert
  to authenticated with check (public.is_owner());

drop policy if exists "owner update units" on public.units;
create policy "owner update units" on public.units for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner delete units" on public.units;
create policy "owner delete units" on public.units for delete
  to authenticated using (public.is_owner());

-- marks
drop policy if exists "read published marks" on public.marks;
create policy "read published marks" on public.marks for select
  to anon, authenticated
  using (is_published or public.is_owner());

drop policy if exists "owner insert marks" on public.marks;
create policy "owner insert marks" on public.marks for insert
  to authenticated with check (public.is_owner());

drop policy if exists "owner update marks" on public.marks;
create policy "owner update marks" on public.marks for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner delete marks" on public.marks;
create policy "owner delete marks" on public.marks for delete
  to authenticated using (public.is_owner());

-- projects
drop policy if exists "read published projects" on public.projects;
create policy "read published projects" on public.projects for select
  to anon, authenticated
  using (is_published or public.is_owner());

drop policy if exists "owner insert projects" on public.projects;
create policy "owner insert projects" on public.projects for insert
  to authenticated with check (public.is_owner());

drop policy if exists "owner update projects" on public.projects;
create policy "owner update projects" on public.projects for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner delete projects" on public.projects;
create policy "owner delete projects" on public.projects for delete
  to authenticated using (public.is_owner());

-- project_media
drop policy if exists "read published media" on public.project_media;
create policy "read published media" on public.project_media for select
  to anon, authenticated
  using (
    (is_published and exists (
      select 1 from public.projects p where p.id = project_id and p.is_published
    ))
    or public.is_owner()
  );

drop policy if exists "owner insert media" on public.project_media;
create policy "owner insert media" on public.project_media for insert
  to authenticated with check (public.is_owner());

drop policy if exists "owner update media" on public.project_media;
create policy "owner update media" on public.project_media for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner delete media" on public.project_media;
create policy "owner delete media" on public.project_media for delete
  to authenticated using (public.is_owner());


drop policy if exists "owner upload portfolio media" on storage.objects;
create policy "owner upload portfolio media" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'portfolio-media' and public.is_owner());

drop policy if exists "owner update portfolio media" on storage.objects;
create policy "owner update portfolio media" on storage.objects for update
  to authenticated
  using (bucket_id = 'portfolio-media' and public.is_owner())
  with check (bucket_id = 'portfolio-media' and public.is_owner());

drop policy if exists "owner delete portfolio media" on storage.objects;
create policy "owner delete portfolio media" on storage.objects for delete
  to authenticated
  using (bucket_id = 'portfolio-media' and public.is_owner());

