begin;

drop policy if exists exam_attempts_update_own on public.exam_attempts;
drop policy if exists exam_attempts_update_staff_own on public.exam_attempts;

create policy exam_attempts_update_staff_own on public.exam_attempts
for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'assistant')
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'assistant')
  )
);

commit;

