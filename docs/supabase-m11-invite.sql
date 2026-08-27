-- conte-rush M11.6 Internal invite self-serve
-- Paste into the Supabase SQL Editor while signed in as a project owner.
-- Do not run from the browser app. Do not put invite codes in frontend JS.
--
-- FIRST DASHBOARD STEP: run this file as-is (tables + grants + apply function).
-- The generate-code block at the bottom stays commented. Do not uncomment it
-- until this migration succeeds and the Edge Function is deployed.
--
-- Additive only. Does not change internal_users / subscriptions RLS.
-- Authenticated clients remain SELECT-own on entitlement tables.
-- Invite tables are service_role only.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.internal_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  enabled boolean not null default true,
  max_uses integer,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_invite_codes_use_count_check check (use_count >= 0),
  constraint internal_invite_codes_max_uses_check
    check (max_uses is null or max_uses > 0),
  constraint internal_invite_codes_use_vs_max_check
    check (max_uses is null or use_count <= max_uses)
);

create table if not exists public.internal_invite_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fail_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  constraint internal_invite_attempts_fail_count_check check (fail_count >= 0)
);

alter table public.internal_invite_codes enable row level security;
alter table public.internal_invite_attempts enable row level security;

revoke all on table public.internal_invite_codes from public, anon, authenticated;
revoke all on table public.internal_invite_attempts from public, anon, authenticated;

grant all on table public.internal_invite_codes to service_role;
grant all on table public.internal_invite_attempts to service_role;

-- No SELECT / INSERT / UPDATE / DELETE policies for anon or authenticated.

-- Atomic consume + grant. Called only by the Edge Function with the service
-- role. SECURITY INVOKER: authenticated cannot use this even if execute leaks.
create or replace function public.apply_internal_invite(
  p_user_id uuid,
  p_code_hash text
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_enabled boolean;
  v_consumed uuid;
begin
  if p_user_id is null or p_code_hash is null or p_code_hash = '' then
    return 'invalid';
  end if;

  select enabled into v_enabled
  from public.internal_users
  where user_id = p_user_id;

  if v_enabled is true then
    return 'already';
  end if;

  update public.internal_invite_codes
  set use_count = use_count + 1,
      updated_at = now()
  where code_hash = p_code_hash
    and enabled = true
    and (max_uses is null or use_count < max_uses)
  returning id into v_consumed;

  if v_consumed is null then
    return 'invalid';
  end if;

  insert into public.internal_users (user_id, enabled)
  values (p_user_id, true)
  on conflict (user_id) do update
  set enabled = true,
      updated_at = now();

  return 'ok';
end;
$$;

revoke all on function public.apply_internal_invite(uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_internal_invite(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Generate one invite code (run after the tables exist).
-- The plaintext appears only in this query result. Do not store it in git.
-- Format: CR-XXXXX-XXXXX  Alphabet omits 0/O/1/I/L (31 chars).
-- Hash input is the compact form CR + 10 alphabet chars (no hyphens).
-- max_uses default: 20
-- ---------------------------------------------------------------------------
--
-- with
-- alphabet as (
--   select '23456789ABCDEFGHJKMNPQRSTUVWXYZ'::text as chars
-- ),
-- chars as (
--   select
--     i,
--     substr(
--       (select chars from alphabet),
--       1 + (get_byte(gen_random_bytes(1), 0) % 31),
--       1
--     ) as ch
--   from generate_series(1, 10) as t(i)
-- ),
-- body as (
--   select string_agg(ch, '' order by i) as body from chars
-- ),
-- code as (
--   select
--     body,
--     'CR-' || substr(body, 1, 5) || '-' || substr(body, 6, 5) as formatted,
--     'CR' || body as normalized
--   from body
-- ),
-- ins as (
--   insert into public.internal_invite_codes (code_hash, enabled, max_uses)
--   select encode(extensions.digest(normalized, 'sha256'), 'hex'), true, 20
--   from code
--   returning id, max_uses, enabled
-- )
-- select
--   code.formatted as invite_code,
--   ins.id,
--   ins.max_uses,
--   ins.enabled
-- from code
-- cross join ins;
--
-- Copy invite_code from the result and share it out of band.
-- Do not paste it into the repo or runtime-config.js.

-- Disable all active codes after distribution:
-- update public.internal_invite_codes
-- set enabled = false,
--     updated_at = now()
-- where enabled = true;

-- Usage:
-- select id, enabled, use_count, max_uses, created_at
-- from public.internal_invite_codes
-- order by created_at desc;
