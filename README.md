# bmunhak.com Setup Notes

## Students migration check/apply
- Verify table exists in Supabase SQL Editor:
```sql
select to_regclass('public.students') as students_table;
```
- If result is `null`, apply migrations:
  1. Preferred (CLI): run `supabase db push` from repo root.
  2. Fallback (SQL Editor): run SQL in [`supabase/migrations/20260301170000_students.sql`](supabase/migrations/20260301170000_students.sql).

## Seed scripts
- Admin role seed: run [`supabase/seed_admin.sql`](supabase/seed_admin.sql) once in SQL Editor (replace `user_id` if needed).
- Students seed (optional): run [`supabase/seed_students.sql`](supabase/seed_students.sql) for demo data.

