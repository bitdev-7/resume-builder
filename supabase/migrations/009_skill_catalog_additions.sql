-- Skill catalog + ontology additions: user-editable custom skills/aliases and custom
-- role archetypes layered on top of the built-in defaults (which stay read-only).
-- One shared global set; any authenticated user can read/write.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

-- Reusable updated_at trigger function (idempotent).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Custom skills + aliases (additions to the skill ontology).
create table if not exists public.skill_catalog_additions (
  id            uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  aliases        text[] not null default '{}',
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  constraint skill_catalog_additions_canonical_name_unique unique (canonical_name)
);

create index if not exists skill_catalog_additions_canonical_name_idx
  on public.skill_catalog_additions (canonical_name);

drop trigger if exists "skill_catalog_additions_set_updated_at" on public.skill_catalog_additions;
create trigger "skill_catalog_additions_set_updated_at"
  before update on public.skill_catalog_additions
  for each row execute function public.set_updated_at();

alter table public.skill_catalog_additions enable row level security;

drop policy if exists "skill_catalog_additions_auth_all" on public.skill_catalog_additions;
create policy "skill_catalog_additions_auth_all" on public.skill_catalog_additions
  for all to authenticated using (true) with check (true);

-- Custom role archetypes (additions to the role-skill catalog).
create table if not exists public.role_archetype_additions (
  id                   text primary key,
  label                text not null,
  title_keywords       text[] not null default '{}',
  core                 text[] not null default '{}',
  ecosystem            jsonb not null default '{}'::jsonb,
  market_relevant      text[] not null default '{}',
  skill_category_hints text[] not null default '{}',
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  version              integer not null default 1
);

drop trigger if exists "role_archetype_additions_set_updated_at" on public.role_archetype_additions;
create trigger "role_archetype_additions_set_updated_at"
  before update on public.role_archetype_additions
  for each row execute function public.set_updated_at();

alter table public.role_archetype_additions enable row level security;

drop policy if exists "role_archetype_additions_auth_all" on public.role_archetype_additions;
create policy "role_archetype_additions_auth_all" on public.role_archetype_additions
  for all to authenticated using (true) with check (true);
