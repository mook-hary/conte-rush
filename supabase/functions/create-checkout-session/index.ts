import Stripe from "npm:stripe@18.5.0";
import postgres from "npm:postgres@3.4.7";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  advisoryLockKey,
  checkoutFailureLog,
  checkoutIdempotencyKey,
  checkoutStageOf,
  customerIdempotencyKey,
  executeCheckoutInsideLock,
  resolveAllowedReturnUrl,
  withCheckoutSuccess,
} from "../_shared/billing.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const stripe = getStripe();
  const priceId = Deno.env.get("STRIPE_PRICE_ID") ?? "";
  const dbUrl = getDbUrl();
  if (!stripe || !priceId || !dbUrl) {
    console.error("checkout session is not configured");
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }

  try {
    const user = await getJwtUser(req);
    if (!user?.id) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const payload = await readJson(req);
    const returnUrl = resolveAllowedReturnUrl(
      payload?.returnUrl,
      Deno.env.get("BILLING_RETURN_ORIGINS"),
    );
    if (!returnUrl) {
      return jsonResponse({ ok: false, error: "invalid_return_url" }, 400);
    }

    const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      const result = await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${advisoryLockKey(user.id)}))`;
        return createCheckoutInsideLock({
          tx,
          stripe,
          priceId,
          user,
          returnUrl,
        });
      });
      return jsonResponse(result);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    console.error(
      "create-checkout-session failed",
      checkoutFailureLog(checkoutStageOf(error), error),
    );
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
});

async function createCheckoutInsideLock({ tx, stripe, priceId, user, returnUrl }) {
  return executeCheckoutInsideLock({
    userId: user.id,
    priceId,
    readMappedCustomerId: async () => {
      const rows = await tx`
        select customer_id
        from public.stripe_customers
        where user_id = ${user.id}::uuid
      `;
      return rows[0]?.customer_id ?? "";
    },
    readSubscriptionCustomerId: async () => {
      const rows = await tx`
        select customer_id
        from public.subscriptions
        where user_id = ${user.id}::uuid
      `;
      return rows[0]?.customer_id ?? "";
    },
    readCustomerOwnerUserId: async (customerId) => {
      const rows = await tx`
        select user_id::text as user_id
        from public.stripe_customers
        where customer_id = ${customerId}
      `;
      return rows[0]?.user_id ?? "";
    },
    insertStripeCustomerIfAbsent: async (_userId, customerId) => {
      await tx`
        insert into public.stripe_customers (user_id, customer_id)
        values (${user.id}::uuid, ${customerId})
        on conflict do nothing
      `;
      const rows = await tx`
        select customer_id
        from public.stripe_customers
        where user_id = ${user.id}::uuid
      `;
      return rows[0]?.customer_id ?? "";
    },
    createStripeCustomer: async () => {
      const customer = await stripe.customers.create(
        {
          email: user.email || undefined,
          metadata: { supabase_user_id: user.id },
        },
        { idempotencyKey: customerIdempotencyKey(user.id) },
      );
      return customer?.id ?? "";
    },
    listSubscriptions: async (customerId) => {
      const result = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      return result.data;
    },
    listOpenCheckoutSessions: async (customerId) => {
      const result = await stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 20,
      });
      return result.data;
    },
    createCheckoutSession: async (customerId) => {
      return stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          client_reference_id: user.id,
          metadata: { supabase_user_id: user.id },
          subscription_data: {
            metadata: { supabase_user_id: user.id },
          },
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: withCheckoutSuccess(returnUrl),
          cancel_url: returnUrl,
        },
        { idempotencyKey: checkoutIdempotencyKey(user.id, priceId) },
      );
    },
  });
}

function getStripe() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) {
    return null;
  }
  return new Stripe(key);
}

function getDbUrl() {
  return (
    Deno.env.get("SUPABASE_DB_URL") ??
    Deno.env.get("DATABASE_URL") ??
    Deno.env.get("SUPABASE_DATABASE_URL") ??
    ""
  );
}

async function getJwtUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    "";
  if (!url || !anon) {
    return null;
  }
  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user?.id) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? "" };
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
