-- =====================================================================
-- Canvas + Gmail import: adds where a task came from.
-- Run this in Supabase → SQL Editor. Safe to run more than once.
-- (Already included at the bottom of schema.sql for fresh projects.)
-- =====================================================================

alter table public.tasks
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists source_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_source_check') then
    alter table public.tasks
      add constraint tasks_source_check check (source in ('manual', 'canvas', 'gmail'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_source_url_check') then
    alter table public.tasks
      add constraint tasks_source_url_check check (source_url is null or source_url like 'https://%');
  end if;
end $$;

-- The same Canvas assignment or email can only be imported once per user.
create unique index if not exists tasks_user_source_external_idx
  on public.tasks (user_id, source, external_id)
  where external_id is not null;
