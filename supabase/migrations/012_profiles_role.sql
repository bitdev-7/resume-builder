-- profiles.role + drop redundant account fields (live on resume_profiles)

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user'));

alter table public.profiles drop column if exists headline;
alter table public.profiles drop column if exists linkedin_url;
alter table public.profiles drop column if exists summary;
alter table public.profiles drop column if exists location;

-- Block JWT clients from changing role (service_role can still promote manually)
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Cannot change profiles.role';
    end if;
  end if;
  if tg_op = 'INSERT' and new.role is distinct from 'user' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Cannot set profiles.role on insert';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before insert or update on public.profiles
  for each row
  execute function public.prevent_profile_role_escalation();
