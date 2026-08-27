-- conte-rush M11.4 Double-subscription prevention + Billing Portal
-- Paste into the Supabase SQL Editor while signed in as a project owner.
-- Do not run from the browser app.
--
-- FIRST DASHBOARD/SQL STEP ONLY after you confirm this file:
--   create stripe_customers + grants. Stop there.
-- Do not deploy Functions or change Stripe until SQL succeeds.
--
-- Additive. Does not change internal_users / subscriptions SELECT-own RLS.
-- Does not cancel Stripe subscriptions.

create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_customers enable row level security;

revoke all on table public.stripe_customers from public, anon, authenticated;
grant all on table public.stripe_customers to service_role;

-- No SELECT / INSERT / UPDATE / DELETE policies for anon or authenticated.

-- After tables exist, map the current subscriptions.customer_id (1:1) if present:
-- insert into public.stripe_customers (user_id, customer_id)
-- select user_id, customer_id
-- from public.subscriptions
-- where provider = 'stripe'
--   and customer_id is not null
-- on conflict (user_id) do nothing;
