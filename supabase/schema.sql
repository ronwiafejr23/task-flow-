-- =====================================================================
-- Kanban Task Board — Supabase schema
-- Run in Supabase Dashboard → SQL Editor (one shot, top to bottom).
-- Prereq: Authentication → Sign In / Providers → enable "Anonymous sign-ins".
-- Every table is owned per guest user via user_id = auth.uid() + RLS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TASKS (required table + bonus fields)
-- ---------------------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  title       text not null
              check (char_length(btrim(title)) between 1 and 200),
  description text,
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority    text not null default 'normal'
              check (priority in ('low', 'normal', 'high')),
  due_date    date,
  position    double precision not null default 0,  -- order within a column
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_user_status_position_idx
  on public.tasks (user_id, status, position);

-- ---------------------------------------------------------------------
-- 2. TEAM MEMBERS (advanced feature 1)
-- ---------------------------------------------------------------------
create table public.team_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  color      text not null default '#6366f1'
             check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create index team_members_user_idx on public.team_members (user_id);

-- Many-to-many: a task can have several assignees
create table public.task_assignees (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  member_id  uuid not null references public.team_members (id) on delete cascade,
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index task_assignees_member_idx on public.task_assignees (member_id);

-- ---------------------------------------------------------------------
-- 3. LABELS (advanced feature 4)
-- ---------------------------------------------------------------------
create table public.labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  color      text not null default '#64748b'
             check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.task_labels (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  user_id  uuid not null default auth.uid()
           references auth.users (id) on delete cascade,
  primary key (task_id, label_id)
);

create index task_labels_label_idx on public.task_labels (label_id);

-- ---------------------------------------------------------------------
-- 4. COMMENTS (advanced feature 2)
-- ---------------------------------------------------------------------
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index comments_task_created_idx on public.comments (task_id, created_at);

-- ---------------------------------------------------------------------
-- 5. ACTIVITY LOG (advanced feature 3) — written only by triggers
-- ---------------------------------------------------------------------
create table public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in (
               'created', 'status_changed', 'title_changed',
               'priority_changed', 'due_date_changed',
               'assigned', 'unassigned')),
  from_value text,
  to_value   text,
  created_at timestamptz not null default now()
);

create index task_activity_task_created_idx
  on public.task_activity (task_id, created_at);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Log task creation and field changes
create or replace function public.log_task_activity()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity (task_id, user_id, action, to_value)
    values (new.id, new.user_id, 'created', new.status);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_activity (task_id, user_id, action, from_value, to_value)
    values (new.id, new.user_id, 'status_changed', old.status, new.status);
  end if;

  if new.title is distinct from old.title then
    insert into public.task_activity (task_id, user_id, action, from_value, to_value)
    values (new.id, new.user_id, 'title_changed', old.title, new.title);
  end if;

  if new.priority is distinct from old.priority then
    insert into public.task_activity (task_id, user_id, action, from_value, to_value)
    values (new.id, new.user_id, 'priority_changed', old.priority, new.priority);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.task_activity (task_id, user_id, action, from_value, to_value)
    values (new.id, new.user_id, 'due_date_changed',
            old.due_date::text, new.due_date::text);
  end if;

  return new;
end;
$$;

create trigger tasks_log_activity
  after insert or update on public.tasks
  for each row execute function public.log_task_activity();

-- Log assignment changes (stores the member's name for the timeline)
create or replace function public.log_assignment_activity()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  member_name text;
begin
  if tg_op = 'INSERT' then
    select name into member_name from public.team_members where id = new.member_id;
    insert into public.task_activity (task_id, user_id, action, to_value)
    values (new.task_id, new.user_id, 'assigned', member_name);
    return new;
  else
    select name into member_name from public.team_members where id = old.member_id;
    -- skip if the parent task is being deleted (cascade)
    if exists (select 1 from public.tasks where id = old.task_id) then
      insert into public.task_activity (task_id, user_id, action, from_value)
      values (old.task_id, old.user_id, 'unassigned', member_name);
    end if;
    return old;
  end if;
end;
$$;

create trigger task_assignees_log_activity
  after insert or delete on public.task_assignees
  for each row execute function public.log_assignment_activity();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Anonymous users get the `authenticated` role with their own auth.uid(),
-- so every policy below scopes rows to the current guest.
-- =====================================================================

alter table public.tasks          enable row level security;
alter table public.team_members   enable row level security;
alter table public.task_assignees enable row level security;
alter table public.labels         enable row level security;
alter table public.task_labels    enable row level security;
alter table public.comments       enable row level security;
alter table public.task_activity  enable row level security;

-- Simple owner-only tables
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own team members" on public.team_members
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own labels" on public.labels
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Join/child tables: also verify the parent rows belong to the same user,
-- so nobody can attach their row to someone else's task by guessing an id.
create policy "own task assignees" on public.task_assignees
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.team_members m
                where m.id = member_id and m.user_id = (select auth.uid()))
  );

create policy "own task labels" on public.task_labels
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.labels l
                where l.id = label_id and l.user_id = (select auth.uid()))
  );

create policy "read own comments" on public.comments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "add comments to own tasks" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
  );

create policy "delete own comments" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Activity log is append-only: readable by owner, inserted only by the
-- triggers above (which run as the same user), never updated or deleted.
create policy "read own activity" on public.task_activity
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "triggers insert own activity" on public.task_activity
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- =====================================================================
-- REALTIME (optional): push task changes to other open tabs
-- =====================================================================
alter publication supabase_realtime add table public.tasks;

-- =====================================================================
-- CANVAS + GMAIL IMPORT: where a task came from
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
