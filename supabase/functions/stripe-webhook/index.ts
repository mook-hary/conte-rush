import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  isAuthUserUuid,
  isHandledStripeEventType,
  mapStripeStatus,
  readCancelAtPeriodEnd,
  readCurrentPeriodEndIso,
  readPriceId,
  readStripeId,
} from "../_shared/stripe-webhook-map.js";
import { shouldIgnoreIncomingStripeSubscription } from "../_shared/billing.js";

type AdminClient = ReturnType<typeof createClient>;

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const signature = req.headers.get("Stripe-Signature") ?? "";
  const signingSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!signingSecret || !stripeKey) {
    console.error("stripe secrets are not configured");
    return jsonResponse({ error: "server misconfigured" }, 500);
  }

  const stripe = new Stripe(stripeKey);
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      signingSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    console.error("stripe signature verification failed", error);
    return new Response("invalid signature", { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) {
    console.error("supabase service role is not configured");
    return jsonResponse({ error: "server misconfigured" }, 500);
  }

  try {
    if (await alreadyProcessed(admin, event.id)) {
      return jsonResponse({ received: true, duplicate: true });
    }

    await handleStripeEvent(admin, stripe, event);
    await recordProcessedEvent(admin, event);
    return jsonResponse({ received: true });
  } catch (error) {
    console.error("stripe webhook handler failed", event.id, event.type, error);
    return jsonResponse({ error: "handler failed" }, 500);
  }
});

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    "";
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function alreadyProcessed(admin: AdminClient, eventId: string) {
  const { data, error } = await admin
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return Boolean(data);
}

async function recordProcessedEvent(admin: AdminClient, event: Stripe.Event) {
  const { error } = await admin.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
  });
  if (error && error.code !== "23505") {
    throw error;
  }
}

async function handleStripeEvent(
  admin: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  if (!isHandledStripeEventType(event.type)) {
    return;
  }
  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(
      admin,
      stripe,
      event.data.object as Stripe.Checkout.Session,
    );
    return;
  }
  await handleSubscriptionEvent(
    admin,
    stripe,
    event.data.object as Stripe.Subscription,
    { deleted: event.type === "customer.subscription.deleted" },
  );
}

async function handleCheckoutCompleted(
  admin: AdminClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.mode && session.mode !== "subscription") {
    return;
  }
  const userId =
    (isAuthUserUuid(session.client_reference_id)
      ? String(session.client_reference_id).trim()
      : "") ||
    (isAuthUserUuid(session.metadata?.supabase_user_id)
      ? String(session.metadata.supabase_user_id).trim()
      : "");
  if (!userId) {
    console.warn("checkout.session.completed ignored: invalid client_reference_id");
    return;
  }

  const customerId = readStripeId(session.customer);
  const subscriptionId = readStripeId(session.subscription);
  if (!customerId && !subscriptionId) {
    console.warn("checkout.session.completed ignored: no customer or subscription id");
    return;
  }

  const existing = await readSubscriptionRowByUser(admin, userId);
  if (shouldIgnoreIncomingStripeSubscription(existing, subscriptionId)) {
    console.warn(
      "checkout.session.completed ignored: blocking subscription already exists",
      existing?.subscription_id,
      subscriptionId,
    );
    return;
  }

  const live = await retrieveSubscription(stripe, subscriptionId);
  const status = mapStripeStatus(live?.status) ?? "incomplete";

  await upsertSubscription(admin, {
    userId,
    customerId,
    subscriptionId,
    status,
    currentPeriodEnd: readCurrentPeriodEndIso(live),
    priceId: readPriceId(live),
    cancelAtPeriodEnd: readCancelAtPeriodEnd(live),
  });
  await ensureStripeCustomer(admin, userId, customerId);
}

async function handleSubscriptionEvent(
  admin: AdminClient,
  stripe: Stripe,
  payload: Stripe.Subscription,
  { deleted }: { deleted: boolean },
) {
  const subscriptionId = readStripeId(payload);
  const customerId = readStripeId(payload.customer);
  const existing = await findSubscriptionRow(admin, subscriptionId, customerId);
  const incomingId = subscriptionId ?? "";
  if (existing && shouldIgnoreIncomingStripeSubscription(existing, incomingId)) {
    console.warn(
      "subscription event ignored: blocking subscription already exists",
      existing.subscription_id,
      incomingId,
    );
    return;
  }

  const userId =
    existing?.user_id ||
    (await readUserIdForCustomer(admin, customerId)) ||
    (isAuthUserUuid(payload.metadata?.supabase_user_id)
      ? String(payload.metadata.supabase_user_id).trim()
      : "");
  if (!userId) {
    return;
  }

  const live = deleted ? null : await retrieveSubscription(stripe, subscriptionId);
  const status = deleted
    ? "canceled"
    : mapStripeStatus(live?.status ?? payload.status);
  if (!status) {
    console.warn("subscription event ignored: no mappable status", subscriptionId);
    return;
  }
  const source = live ?? payload;

  await upsertSubscription(admin, {
    userId,
    customerId: readStripeId(source.customer) ?? customerId,
    subscriptionId: readStripeId(source) ?? subscriptionId,
    status,
    currentPeriodEnd: readCurrentPeriodEndIso(source),
    priceId: readPriceId(source),
    cancelAtPeriodEnd: deleted ? false : readCancelAtPeriodEnd(source),
  });
  await ensureStripeCustomer(
    admin,
    userId,
    readStripeId(source.customer) ?? customerId,
  );
}

async function retrieveSubscription(stripe: Stripe, subscriptionId: string | null) {
  if (!subscriptionId) {
    return null;
  }
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.warn("subscription retrieve failed", subscriptionId, error);
    return null;
  }
}

async function findSubscriptionRow(
  admin: AdminClient,
  subscriptionId: string | null,
  customerId: string | null,
) {
  if (subscriptionId) {
    const bySubscription = await admin
      .from("subscriptions")
      .select("user_id, subscription_id, status")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();
    if (bySubscription.error) {
      throw bySubscription.error;
    }
    if (bySubscription.data?.user_id) {
      return bySubscription.data;
    }
  }
  if (customerId) {
    const byCustomer = await admin
      .from("subscriptions")
      .select("user_id, subscription_id, status")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (byCustomer.error) {
      throw byCustomer.error;
    }
    if (byCustomer.data?.user_id) {
      return byCustomer.data;
    }
  }
  return null;
}

async function readSubscriptionRowByUser(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id, subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function readUserIdForCustomer(admin: AdminClient, customerId: string | null) {
  if (!customerId) {
    return "";
  }
  const mapped = await admin
    .from("stripe_customers")
    .select("user_id")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (mapped.error) {
    throw mapped.error;
  }
  return mapped.data?.user_id ?? "";
}

async function ensureStripeCustomer(
  admin: AdminClient,
  userId: string,
  customerId: string | null,
) {
  if (!userId || !customerId) {
    return;
  }
  const { error } = await admin.from("stripe_customers").upsert(
    {
      user_id: userId,
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (error && error.code !== "23505") {
    throw error;
  }
}

async function upsertSubscription(
  admin: AdminClient,
  row: {
    userId: string;
    customerId: string | null;
    subscriptionId: string | null;
    status: string;
    currentPeriodEnd: string | null;
    priceId: string | null;
    cancelAtPeriodEnd: boolean;
  },
) {
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: row.userId,
      provider: "stripe",
      status: row.status,
      current_period_end: row.currentPeriodEnd,
      customer_id: row.customerId,
      subscription_id: row.subscriptionId,
      price_id: row.priceId,
      cancel_at_period_end: row.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error?.code === "23503") {
    console.warn("subscriptions upsert ignored: user_id is not an Auth user", row.userId);
    return;
  }
  if (error) {
    throw error;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
