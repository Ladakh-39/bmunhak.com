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

function tokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return "";
  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!val) continue;
    if (key === "sb-access-token" || key === "access_token" || key === "access-token") {
      try { return decodeURIComponent(val); } catch { return val; }
    }
  }
  return "";
}

function extractAccessToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (authz && /^Bearer\s+/i.test(authz)) return authz.replace(/^Bearer\s+/i, "").trim();
  return tokenFromCookieHeader(getHeader(event?.headers, "cookie"));
}

function requestIdFromEvent(event) {
  return (
    getHeader(event?.headers, "x-nf-request-id") ||
    getHeader(event?.headers, "x-request-id") ||
    `req_${Math.random().toString(36).slice(2, 10)}`
  );
}

function normalizeAttemptIds(body) {
  const ids = [];
  if (Number.isFinite(Number(body?.attempt_id))) ids.push(Math.trunc(Number(body.attempt_id)));
  if (Array.isArray(body?.attempt_ids)) {
    for (const value of body.attempt_ids) {
      const n = Number(value);
      if (Number.isFinite(n)) ids.push(Math.trunc(n));
    }
  } else if (body?.attempt_ids && typeof body.attempt_ids === "object") {
    for (const value of Object.values(body.attempt_ids)) {
      const n = Number(value);
      if (Number.isFinite(n)) ids.push(Math.trunc(n));
    }
  }
  return [...new Set(ids.filter((n) => n > 0))].slice(0, 20);
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
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(500, { ok: false, code: "MISSING_ENV", requestId });
    }

    const accessToken = extractAccessToken(event);
    if (!accessToken) {
      return json(401, { ok: false, code: "UNAUTHORIZED", requestId });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userRes = await admin.auth.getUser(accessToken);
    const userId = userRes?.data?.user?.id;
    if (userRes.error || !userId) {
      return json(401, { ok: false, code: "UNAUTHORIZED", requestId });
    }

    const payload = JSON.parse(event.body || "{}");
    const attemptIds = normalizeAttemptIds(payload);
    if (!attemptIds.length) {
      return json(400, { ok: false, code: "ATTEMPT_ID_REQUIRED", requestId });
    }

    const { data, error } = await admin
      .from("exam_attempts")
      .update({ viewed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", attemptIds)
      .select("id");

    if (error) {
      console.error(JSON.stringify({
        event: "mark_attempt_viewed_error",
        requestId,
        durationMs: Date.now() - startedAt,
        code: "UPDATE_FAILED",
      }));
      return json(500, { ok: false, code: "UPDATE_FAILED", requestId });
    }

    console.info(JSON.stringify({
      event: "mark_attempt_viewed_ok",
      requestId,
      durationMs: Date.now() - startedAt,
      updatedCount: (data || []).length,
    }));

    return json(200, {
      ok: true,
      requestId,
      updated_count: (data || []).length,
    });
  } catch (_error) {
    console.error(JSON.stringify({
      event: "mark_attempt_viewed_error",
      requestId,
      durationMs: Date.now() - startedAt,
      code: "SERVER_ERROR",
    }));
    return json(500, { ok: false, code: "SERVER_ERROR", requestId });
  }
}
