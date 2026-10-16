-- Market study schema.
-- All participant writes go through the app's API using the service role key.
-- Row Level Security is on for every table with NO policies for anon/authenticated,
-- so the public anon key can read or write nothing.

create extension if not exists pgcrypto;

create table if not exists participants (
  id uuid primary key,
  code text not null unique,
  ref_code text,
  status text not null default 'consented'
    check (status in ('consented','screened_out','surveyed','in_journey','completed','abandoned')),
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  qualified_owner boolean,
  qualified_renter boolean,
  screen_out_reason text,
  journey_order text[],
  last_step text,
  device text,
  user_agent text,
  viewport_w int,
  viewport_h int,
  timezone text,
  utm jsonb,
  state jsonb
);
create index if not exists participants_ref_idx on participants (ref_code);
create index if not exists participants_status_idx on participants (status);

create table if not exists responses (
  participant_id uuid not null references participants(id) on delete cascade,
  phase text not null check (phase in ('screener','survey','checkpoint','behavior','wrapup')),
  question_id text not null,
  journey text not null default '',
  step_id text,
  value jsonb,
  ms_to_answer int,
  change_count int not null default 0,
  answered_at timestamptz not null,
  primary key (participant_id, question_id, journey)
);
create index if not exists responses_question_idx on responses (question_id);

create table if not exists events (
  id bigserial primary key,
  participant_id uuid not null references participants(id) on delete cascade,
  session_id text not null,
  seq int not null,
  client_ts timestamptz not null,
  received_at timestamptz not null default now(),
  journey text,
  step_id text,
  screen_id text,
  type text not null,
  element_id text,
  label text,
  x double precision,
  y double precision,
  doc_w double precision,
  doc_h double precision,
  vw double precision,
  vh double precision,
  meta jsonb,
  unique (participant_id, session_id, seq)
);
create index if not exists events_participant_idx on events (participant_id, client_ts);
create index if not exists events_type_idx on events (type);
create index if not exists events_screen_type_idx on events (screen_id, type);

create table if not exists replay_chunks (
  participant_id uuid not null references participants(id) on delete cascade,
  session_id text not null,
  idx int not null,
  storage_path text not null,
  started_at timestamptz not null,
  bytes int not null default 0,
  primary key (participant_id, session_id, idx)
);

-- Kept apart from everything else so contact details can be deleted on their own.
create table if not exists interview_contacts (
  participant_id uuid primary key references participants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  best_time text,
  persona text not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table participants enable row level security;
alter table responses enable row level security;
alter table events enable row level security;
alter table replay_chunks enable row level security;
alter table interview_contacts enable row level security;
alter table admin_users enable row level security;

-- Private bucket for session replays (served to admins through the app only).
insert into storage.buckets (id, name, public)
values ('replays', 'replays', false)
on conflict (id) do nothing;

/* ------------------------------------------------------------------ */
/* Analysis views (for the SQL editor or exports)                       */
/* ------------------------------------------------------------------ */

-- One row per step visit: time active, idle, and how it ended.
create or replace view v_step_metrics with (security_invoker = true) as
select
  e.participant_id,
  e.journey,
  e.step_id,
  e.screen_id,
  (e.meta->>'outcome') as outcome,
  (e.meta->>'duration_ms')::int as duration_ms,
  (e.meta->>'active_ms')::int as active_ms,
  (e.meta->>'idle_ms')::int as idle_ms,
  (e.meta->>'first_interaction_ms')::int as first_interaction_ms,
  (e.meta->>'clicks')::int as clicks,
  (e.meta->>'dead_clicks')::int as dead_clicks,
  (e.meta->>'rage_clicks')::int as rage_clicks,
  (e.meta->>'max_scroll_pct')::int as max_scroll_pct,
  e.client_ts as exited_at
from events e
where e.type = 'step_exit';

-- Funnel counts by status and persona.
create or replace view v_funnel with (security_invoker = true) as
select
  count(*) as visited_consented,
  count(*) filter (where status <> 'consented') as screened,
  count(*) filter (where qualified_owner or qualified_renter) as qualified,
  count(*) filter (where qualified_owner and not coalesce(qualified_renter,false)) as owner_only,
  count(*) filter (where qualified_renter and not coalesce(qualified_owner,false)) as renter_only,
  count(*) filter (where qualified_owner and qualified_renter) as dual,
  count(*) filter (where status = 'completed') as completed
from participants;

-- Answers, one row per participant, one column per survey/screener question.
create or replace view v_responses_wide with (security_invoker = true) as
select
  p.code,
  p.status,
  p.qualified_owner,
  p.qualified_renter,
  p.journey_order,
  p.ref_code,
  p.created_at,
  jsonb_object_agg(r.question_id || case when r.journey <> '' then '@' || r.journey else '' end, r.value) as answers
from participants p
left join responses r on r.participant_id = p.id
group by p.id;

-- Views run as the caller (security_invoker), so RLS still applies. Belt and braces:
revoke all on v_step_metrics, v_funnel, v_responses_wide from anon, authenticated;
