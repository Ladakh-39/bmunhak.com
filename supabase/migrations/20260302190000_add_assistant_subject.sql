alter table public.profiles
add column if not exists assistant_subject text;

alter table public.profiles
drop constraint if exists profiles_assistant_subject_check;

alter table public.profiles
add constraint profiles_assistant_subject_check
check (
  assistant_subject is null
  or assistant_subject in ('korean','math','english')
);

comment on column public.profiles.assistant_subject
is 'Assistant 담당 과목 (korean | math | english). assistant role일 때만 사용.';
