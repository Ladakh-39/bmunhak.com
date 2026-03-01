-- Seed (optional): demo students for TA selector UI testing.
-- Run this only after students migration is applied.

-- 1) Must return 'public.students' before insert
select to_regclass('public.students') as students_table;

-- 2) Insert sample rows (idempotent by grade_level/grade_year/name)
with sample(grade_level, grade_year, name) as (
  values
    ('중등', 1, '중1 홍길동'),
    ('중등', 2, '중2 김영희'),
    ('중등', 3, '중3 이철수'),
    ('고등', 1, '고1 박민수'),
    ('고등', 2, '고2 최수진'),
    ('고등', 3, '고3 장현우')
)
insert into public.students (grade_level, grade_year, name)
select s.grade_level, s.grade_year, s.name
from sample s
where not exists (
  select 1
  from public.students t
  where t.grade_level = s.grade_level
    and t.grade_year = s.grade_year
    and t.name = s.name
);

-- 3) Verify
select id, grade_level, grade_year, name, user_id, created_at
from public.students
order by grade_level, grade_year, name;

