begin;

create table if not exists public.exam_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  year int not null,
  section text not null,
  form text,
  raw_score int not null default 0,
  official_total int not null default 0,
  standard_score numeric,
  percentile numeric,
  viewed_at timestamptz,
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create index if not exists exam_attempts_user_created_idx
on public.exam_attempts (user_id, created_at desc);

create table if not exists public.exam_attempt_items (
  attempt_id bigint not null references public.exam_attempts(id) on delete cascade,
  item_no int not null,
  my_answer int,
  is_correct boolean,
  primary key (attempt_id, item_no)
);

-- compatibility columns for existing grade flow
alter table public.exam_attempt_items add column if not exists user_id uuid;
alter table public.exam_attempt_items add column if not exists correct_answer int;
alter table public.exam_attempt_items add column if not exists p_correct numeric;

alter table public.exam_attempts enable row level security;
alter table public.exam_attempt_items enable row level security;

drop policy if exists exam_attempts_select_own on public.exam_attempts;
create policy exam_attempts_select_own on public.exam_attempts
for select using (auth.uid() = user_id and is_deleted = false);

drop policy if exists exam_attempts_insert_own on public.exam_attempts;
create policy exam_attempts_insert_own on public.exam_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists exam_attempts_update_own on public.exam_attempts;
create policy exam_attempts_update_own on public.exam_attempts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists exam_attempt_items_select_own on public.exam_attempt_items;
create policy exam_attempt_items_select_own on public.exam_attempt_items
for select using (
  exists (
    select 1 from public.exam_attempts a
    where a.id = exam_attempt_items.attempt_id
      and a.user_id = auth.uid()
      and a.is_deleted = false
  )
);

drop policy if exists exam_attempt_items_insert_own on public.exam_attempt_items;
create policy exam_attempt_items_insert_own on public.exam_attempt_items
for insert with check (
  exists (
    select 1 from public.exam_attempts a
    where a.id = exam_attempt_items.attempt_id
      and a.user_id = auth.uid()
  )
);

commit;
