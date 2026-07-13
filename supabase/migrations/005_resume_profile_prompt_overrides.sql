-- Per-resume-profile editable AI prompt guidance overrides.
-- Keys map to lib/prompts/prompt-overrides.ts PromptKey; values are the custom guidance text.
alter table public.resume_profiles
  add column if not exists prompt_overrides jsonb not null default '{}'::jsonb;
