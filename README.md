# Taskflow — Kanban Task Board

A Trello/Linear-style task board built with **React + TypeScript + Vite** and **Supabase**.
Each visitor gets a private guest account automatically, and their tasks are isolated with Row Level Security.

## Features

**Core**
- Four columns (To Do, In Progress, In Review, Done) with drag-and-drop between and within columns
- Create tasks with title, description, status, priority and due date
- Anonymous guest sign-in on first visit; data persists for that browser
- Loading skeletons, empty states, error banner with retry, toast messages for failed saves
- Optimistic updates: cards move instantly and roll back if the save fails

**Advanced**
- Task comments
- Activity log (written by Postgres triggers): moves, renames, priority, due date, assignment
- Labels/tags with filtering
- Due-date badges (overdue in red, due soon in amber)
- Search plus filters by priority, label and assignee
- Board summary: total, completed %, due this week, overdue

**Assistant** (rule-based, runs in the browser — no AI service or API key)
- **Canvas auto-sync:** connect once and it adds new, unsubmitted Canvas work to To Do when the board opens and every 30 minutes, with priority set from the due date
- **Quick reminders:** type "remind me to email my professor Friday" and it becomes a task due that Friday
- **Do these first:** ranks open tasks by due date, priority and what's already started
- **Due-date alerts:** a bar above the board plus one optional browser notification a day

**Integrations**
- **Canvas:** import upcoming assignments, quizzes and discussions (next 60 days) as tasks with their due dates
- **Gmail:** import unread emails from the last 14 days as tasks (read-only access)
- Imported cards show a Canvas/Gmail badge and link back to the original; nothing is imported twice

**Theme**
- Black, futuristic space theme: starfield background, cyan glow accents, Orbitron display type

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Enable guest sign-ins:** Authentication → Sign In / Providers → turn on **Anonymous sign-ins**.
3. **Create the tables:** open SQL Editor, paste all of `supabase/schema.sql`, and click Run.
   If you ran an earlier version of the schema, run `supabase/migration_002_integrations.sql` instead.
4. **Add your keys:** copy `.env.example` to `.env.local` and fill in the values from Project Settings → API:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Only the public anon key goes in the frontend. Never use the service role key.
5. **Run it:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:5173.

## Connect Canvas (optional)

**On your own computer (`npm run dev`):** nothing to deploy. Vite forwards Canvas requests from your machine (see `vite.config.ts`). Open **Assistant → Canvas auto-sync**, paste a Canvas access token, and click Connect. The token is kept in your browser's storage on that computer only. The Canvas address defaults to `lincolnu.instructure.com`; set `VITE_CANVAS_URL` in `.env.local` to change it.

**On a deployed site:** Canvas blocks direct calls from a browser, so the deployed app goes through a small Supabase Edge Function.

1. Deploy the function (one time):
   ```bash
   npx supabase login
   npx supabase functions deploy canvas-proxy --project-ref YOUR_PROJECT_REF
   ```
   Or in the Supabase Dashboard: Edge Functions → Deploy a new function → name it `canvas-proxy` → paste `supabase/functions/canvas-proxy/index.ts`.
2. In Canvas: Account → Settings → **New Access Token**. Copy it.
3. In the app: **Import → Canvas**, enter your school address (e.g. `yourschool.instructure.com`) and paste the token.

The token is sent only for that request and is never stored. Only `*.instructure.com` hosts are allowed; for a custom Canvas domain set the function secret `CANVAS_ALLOWED_HOSTS`.

## Connect Gmail (optional)

1. Go to console.cloud.google.com, create a project, and enable the **Gmail API**.
2. OAuth consent screen: User type External, add your own Gmail address under **Test users**.
3. Credentials → Create credentials → **OAuth client ID** → Web application.
   Authorized JavaScript origins: `http://localhost:5173` (and your Vercel URL later).
4. Put the client ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID=...` and restart `npm run dev`.
5. In the app: **Import → Gmail → Connect Gmail**.

Access is read-only (`gmail.readonly`). The Google token stays in memory in your browser and is never saved.

## Deploy (Vercel)

1. Push the repo to GitHub (keep it out of your public profile while the assessment is active).
2. Import it in Vercel. Framework preset: Vite.
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and `VITE_GOOGLE_CLIENT_ID` if you use Gmail) under Environment Variables, then deploy.

## Project structure

```
src/
  App.tsx                 page layout, filters, modals
  hooks/useAuth.ts        guest (anonymous) session
  hooks/useBoard.ts       data loading + optimistic mutations
  components/Board.tsx    dnd-kit columns and drag logic
  components/TaskCard.tsx card UI
  components/TaskPanel.tsx task details, comments, activity
  components/TaskModal.tsx create-task form
  components/ManageModal.tsx team members and labels
  components/ImportModal.tsx Canvas and Gmail import
  lib/canvas.ts           Canvas import (via Edge Function)
  lib/gmail.ts            Gmail import (Google Identity Services)
  lib/supabase.ts         Supabase client
  lib/dates.ts            due-date and time helpers
supabase/schema.sql       tables, triggers, RLS policies
supabase/functions/canvas-proxy/index.ts   Canvas API proxy
```

## Design decisions

- **Ordering:** each task has a `position` number. On drop, the new position is the midpoint between its neighbours, so a move updates only one row.
- **Security:** every table has `user_id default auth.uid()` and RLS policies that compare it to `auth.uid()`. Join tables also check that the linked task, member or label belongs to the same user.
- **Activity log:** written by database triggers, so it stays accurate no matter which client changes the task.
- **Integrations:** Canvas and Gmail credentials are never stored. The Canvas token passes through the Edge Function for one request; the Gmail token stays in browser memory. Imported tasks carry `source` + `external_id` with a unique index, so re-importing can't create duplicates.
- **Optimistic UI:** state updates first; on a Supabase error the previous value is restored and a toast explains what happened.

## Testing RLS

Open the app in a normal window and in a private/incognito window. Each window is a different guest and sees only its own tasks.
