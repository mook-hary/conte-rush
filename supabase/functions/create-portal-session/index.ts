import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { resolveAllowedReturnUrl } from "../_shared/billing.js";

type AdminClient = ReturnType<typeof createClient>;

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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!stripeKey) {
    console.error("portal session is not configured");
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }

  try {
    const userId = await getJwtUserId(req);
    if (!userId) {
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

    const admin = getAdminClient();
    if (!admin) {
      return jsonResponse({ ok: false, error: "server_error" }, 500);
    }

    const customerId = await readCustomerId(admin, userId);
    if (!customerId) {
      return jsonResponse({ ok: false, error: "no_customer" }, 404);
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    if (!session.url) {
      throw new Error("portal session missing url");
    }
    return jsonResponse({ ok: true, action: "portal", url: session.url });
  } catch (error) {
    console.error("create-portal-session failed", error);
    return jsonResponse({ ok: false, error: "server_error" }, 500);
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
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readCustomerId(admin: AdminClient, userId: string) {
  const byMap = await admin
    .from("stripe_customers")
    .select("customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (byMap.error) {
    throw byMap.error;
  }
  if (byMap.data?.customer_id) {
    return byMap.data.customer_id;
  }

  const bySub = await admin
    .from("subscriptions")
    .select("customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (bySub.error) {
    throw bySub.error;
  }
  return bySub.data?.customer_id ?? null;
}

async function getJwtUserId(req: Request) {
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
  return data.user.id;
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
