import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  hashNormalizedInviteCode,
  isInviteRateLimited,
  isNormalizedInviteCode,
  nextInviteFailAttempt,
  normalizeInviteCode,
} from "../_shared/internal-invite.js";

type AdminClient = ReturnType<typeof createClient>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const admin = getAdminClient();
  if (!admin) {
    console.error("supabase service role is not configured");
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }

  try {
    const userId = await getJwtUserId(req);
    if (!userId) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    if (await isEnabledInternal(admin, userId)) {
      return jsonResponse({ ok: true });
    }

    const attempt = await readAttempt(admin, userId);
    if (isInviteRateLimited(attempt)) {
      return jsonResponse({ ok: false, error: "rate_limited" }, 429);
    }

    const payload = await readJson(req);
    const normalized = normalizeInviteCode(payload?.code);
    if (!isNormalizedInviteCode(normalized)) {
      await recordFailure(admin, userId, attempt);
      return jsonResponse({ ok: false, error: "invalid_code" }, 400);
    }

    const codeHash = await hashNormalizedInviteCode(normalized);
    const outcome = await applyInvite(admin, userId, codeHash);
    if (outcome !== "ok" && outcome !== "already") {
      await recordFailure(admin, userId, attempt);
      return jsonResponse({ ok: false, error: "invalid_code" }, 400);
    }

    await clearAttempt(admin, userId);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("redeem-internal-invite failed", error);
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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

async function isEnabledInternal(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("internal_users")
    .select("enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.enabled === true;
}

async function readAttempt(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("internal_invite_attempts")
    .select("fail_count, window_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function recordFailure(
  admin: AdminClient,
  userId: string,
  attempt: { fail_count?: number; window_started_at?: string } | null,
) {
  const next = nextInviteFailAttempt(attempt);
  const { error } = await admin.from("internal_invite_attempts").upsert(
    {
      user_id: userId,
      fail_count: next.fail_count,
      window_started_at: next.window_started_at,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw error;
  }
}

async function clearAttempt(admin: AdminClient, userId: string) {
  const { error } = await admin
    .from("internal_invite_attempts")
    .delete()
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
}

async function applyInvite(admin: AdminClient, userId: string, codeHash: string) {
  const { data, error } = await admin.rpc("apply_internal_invite", {
    p_user_id: userId,
    p_code_hash: codeHash,
  });
  if (error) {
    throw error;
  }
  return data;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
