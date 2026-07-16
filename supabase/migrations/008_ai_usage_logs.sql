-- AI usage logs: one row per LLM call (tokens / cost / model / stage / duration).
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

create table if not exists public.ai_usage_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  profile_id        uuid references public.resume_profiles (id) on delete set null,
  -- High-level feature that triggered the call (resume_generation, ats_check, ...).
  source            text not null default 'resume_generation',
  -- Pipeline step / stage tag (jd-analyzer, experience-writer:batched, composer, ...).
  stage             text not null default 'ai-call',
  provider          text,
  model             text not null,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  cost_usd          numeric not null default 0,
  cost_source       text not null default 'estimated'
    check (cost_source in ('provider', 'estimated')),
  duration_ms       integer,
  success           boolean not null default true,
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_id_idx on public.ai_usage_logs (user_id);
create index if not exists ai_usage_logs_profile_id_idx on public.ai_usage_logs (profile_id);
create index if not exists ai_usage_logs_created_at_idx on public.ai_usage_logs (created_at);
create index if not exists ai_usage_logs_source_idx on public.ai_usage_logs (source);

alter table public.ai_usage_logs enable row level security;

drop policy if exists "ai_usage_logs_all_own" on public.ai_usage_logs;
create policy "ai_usage_logs_all_own" on public.ai_usage_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
