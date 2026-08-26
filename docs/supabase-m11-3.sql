-- conte-rush M11.3
-- Paste this into the Supabase SQL Editor while signed in as a project owner.
-- Do not run from the browser app. Do not put Stripe secrets in SQL.
--
-- Additive only. Does not change RLS SELECT-own policies, grants for
-- anon/authenticated, or effectiveAccess rules.
-- Writes remain service role (Edge Function webhook) only.

alter table public.subscriptions
  add column if not exists price_id text;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

create unique index if not exists subscriptions_stripe_subscription_id_uidx
  on public.subscriptions (subscription_id)
  where subscription_id is not null;

create unique index if not exists subscriptions_stripe_customer_id_uidx
  on public.subscriptions (customer_id)
  where customer_id is not null;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

-- No INSERT / UPDATE / DELETE / SELECT policies for anon or authenticated.
-- The browser never reads this table.
