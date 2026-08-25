-- conte-rush M11.0
-- Paste this into the Supabase SQL Editor while signed in as a project owner.
-- Do not run from the browser app. The app never creates tables.
--
-- Holds only Auth entitlement. No PDF / Panel / Rush / MP4 / Timesheet.

create table if not exists public.internal_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null,
  status text not null,
  current_period_end timestamptz,
  customer_id text,
  subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_check
    check (provider in ('stripe', 'manual_fixture')),
  constraint subscriptions_status_check
    check (status in (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'paused'
    ))
);

alter table public.internal_users enable row level security;
alter table public.subscriptions enable row level security;

revoke all on table public.internal_users from public, anon, authenticated;
revoke all on table public.subscriptions from public, anon, authenticated;

grant select on table public.internal_users to authenticated;
grant select on table public.subscriptions to authenticated;

grant all on table public.internal_users to service_role;
grant all on table public.subscriptions to service_role;

drop policy if exists internal_users_select_own on public.internal_users;
create policy internal_users_select_own
  on public.internal_users
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies for anon or authenticated.
-- Writes are service role only (Dashboard SQL, later admin / Stripe webhook).

-- ---------------------------------------------------------------------------
-- Fixtures (run after the user has signed in once)
-- Internal grant/revoke by email: docs/supabase-m11-1-internal.sql (M11.1).
-- Paid fixture below still uses a UUID because it is a one-off test row.
-- ---------------------------------------------------------------------------

-- Internal (free) access: do not copy UUIDs by hand. Use M11.1 SQL.

-- Paid access without Stripe (M11.0):
-- insert into public.subscriptions (
--   user_id,
--   provider,
--   status,
--   current_period_end,
--   customer_id,
--   subscription_id
-- )
-- values (
--   'USER_UUID',
--   'manual_fixture',
--   'active',
--   now() + interval '30 days',
--   null,
--   null
-- )
-- on conflict (user_id) do update
--   set provider = excluded.provider,
--       status = excluded.status,
--       current_period_end = excluded.current_period_end,
--       updated_at = now();

-- Remove paid fixture:
-- delete from public.subscriptions where user_id = 'USER_UUID';
