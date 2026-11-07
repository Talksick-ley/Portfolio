-- =============================================================
-- MIGRATION: allow "Practical" marks
-- Run ONCE in Supabase Dashboard → SQL Editor on your existing project.
--
-- What it changes: only the allowed values of marks.kind.
-- It does NOT change tables, data, row level security policies,
-- storage, authentication or your Supabase URL/keys.
-- =============================================================

alter table public.marks drop constraint if exists marks_kind_check;

alter table public.marks
  add constraint marks_kind_check
  check (kind in ('CAT', 'Exam', 'Practical'));

-- Optional check: should list the new constraint including 'Practical'
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.marks'::regclass and contype = 'c';
