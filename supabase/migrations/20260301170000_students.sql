create table if not exists public.students (
  id bigint generated always as identity primary key,
  grade_level text not null check (grade_level in ('중등', '고등')),
  grade_year int not null check (grade_year in (1, 2, 3)),
  name text not null,
  user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists students_grade_level_year_name_idx
on public.students (grade_level, grade_year, name);

create unique index if not exists students_user_id_unique_idx
on public.students (user_id)
where user_id is not null;

alter table public.students enable row level security;

drop policy if exists students_select_assistant on public.students;
create policy students_select_assistant on public.students
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) in ('assistant', 'admin')
  )
);

drop policy if exists students_insert_admin on public.students;
create policy students_insert_admin on public.students
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

drop policy if exists students_update_admin on public.students;
create policy students_update_admin on public.students
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

drop policy if exists students_delete_admin on public.students;
create policy students_delete_admin on public.students
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

grant select, insert, update, delete on table public.students to authenticated;
grant usage, select on sequence public.students_id_seq to authenticated;
grant all on table public.students to service_role;
grant usage, select on sequence public.students_id_seq to service_role;
