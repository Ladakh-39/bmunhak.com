import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const hit = Object.keys(headers).find((k) => String(k).toLowerCase() === String(name).toLowerCase());
  return hit ? String(headers[hit] || "") : "";
}

function requestIdFromEvent(event) {
  return (
    getHeader(event?.headers, "x-nf-request-id") ||
    getHeader(event?.headers, "x-request-id") ||
    `req_${Math.random().toString(36).slice(2, 10)}`
  );
}

function extractBearerToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (!authz || !/^Bearer\s+/i.test(authz)) return "";
  return authz.replace(/^Bearer\s+/i, "").trim();
}

function extractClientIp(event) {
  const netlifyIp = getHeader(event?.headers, "x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp.trim();
  const forwarded = getHeader(event?.headers, "x-forwarded-for");
  if (!forwarded) return "";
  return String(forwarded).split(",")[0].trim();
}

function hashIp(ip, salt) {
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

function parsePostId(body) {
  const n = Number(body?.post_id);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFromEvent(event);
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", requestId });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(500, { ok: false, code: "MISSING_ENV", requestId });
    }

    const salt = String(process.env.VIEW_IP_SALT || "dev");
    if (!process.env.VIEW_IP_SALT) {
      console.warn(JSON.stringify({
        event: "track_post_view_warn",
        requestId,
        reason: "missing_view_ip_salt",
      }));
    }
    const cooldown = Math.max(0, Number.parseInt(String(process.env.POST_VIEW_COOLDOWN_MINUTES || "10"), 10) || 10);

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, code: "INVALID_JSON", requestId });
    }
    const postId = parsePostId(body);
    if (!postId) {
      return json(400, { ok: false, code: "POST_ID_REQUIRED", requestId });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: post, error: postError } = await admin
      .from("board_posts")
      .select("id,author_id,view_count,is_deleted")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      console.error(JSON.stringify({
        event: "track_post_view_error",
        requestId,
        durationMs: Date.now() - startedAt,
        code: "POST_QUERY_FAILED",
      }));
      return json(500, { ok: false, code: "SERVER_ERROR", requestId });
    }
    if (!post || post.is_deleted) {
      return json(404, { ok: false, code: "POST_NOT_FOUND", requestId });
    }

    const token = extractBearerToken(event);
    let userId = "";
    if (token && ANON_KEY) {
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData } = await anonClient.auth.getUser(token);
      userId = String(userData?.user?.id || "");
    }

    if (userId && userId === String(post.author_id || "")) {
      return json(200, {
        ok: true,
        requestId,
        counted: false,
        reason: "self",
        view_count: Number(post.view_count || 0),
      });
    }

    const viewerKey = userId
      ? `u:${userId}`
      : `i:${hashIp(extractClientIp(event) || "0.0.0.0", salt)}`;

    const { data: rpcData, error: rpcError } = await admin.rpc("board_post_try_count_view", {
      p_post_id: postId,
      p_viewer_key: viewerKey,
      p_now: new Date().toISOString(),
      p_cooldown_minutes: cooldown,
    });

    if (rpcError) {
      console.error(JSON.stringify({
        event: "track_post_view_error",
        requestId,
        durationMs: Date.now() - startedAt,
        code: "RPC_FAILED",
      }));
      return json(500, { ok: false, code: "SERVER_ERROR", requestId });
    }

    const row = Array.isArray(rpcData) ? (rpcData[0] || {}) : (rpcData || {});
    const counted = Boolean(row.counted);
    const viewCount = Number.isFinite(Number(row.view_count))
      ? Number(row.view_count)
      : Number(post.view_count || 0);

    console.info(JSON.stringify({
      event: "track_post_view_ok",
      requestId,
      durationMs: Date.now() - startedAt,
      counted,
      mode: userId ? "user" : "ip",
    }));

    return json(200, {
      ok: true,
      requestId,
      counted,
      view_count: viewCount,
    });
  } catch {
    console.error(JSON.stringify({
      event: "track_post_view_error",
      requestId,
      durationMs: Date.now() - startedAt,
      code: "SERVER_ERROR",
    }));
    return json(500, { ok: false, code: "SERVER_ERROR", requestId });
  }
}
