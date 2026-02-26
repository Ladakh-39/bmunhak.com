begin;

create table if not exists public.mothertung_answers (
  year int not null,
  subject text not null,
  qnum int not null,
  answer int not null,
  created_at timestamptz not null default now(),
  primary key (year, subject, qnum)
);

-- lock down: NO client select
alter table public.mothertung_answers enable row level security;

-- DO NOT create select policy for anon/authenticated.
-- allow only service_role via RLS bypass.

commit;
