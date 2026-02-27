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
  const key = Object.keys(headers).find((k) => String(k).toLowerCase() === String(name).toLowerCase());
  return key ? String(headers[key] || "") : "";
}

function requestIdFrom(headers) {
  const fromHeader = getHeader(headers, "x-request-id");
  if (fromHeader) return fromHeader.slice(0, 64);
  return crypto.randomUUID();
}

function extractBearerToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (!authz || !/^Bearer\s+/i.test(authz)) return "";
  return authz.replace(/^Bearer\s+/i, "").trim();
}

function parsePostId(body) {
  const n = Number(body?.post_id);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

function logEvent(level, eventName, payload = {}) {
  const line = JSON.stringify({ event: eventName, ...payload });
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

async function isAdminUser(adminClient, userId) {
  if (!userId) return false;
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = String(profile?.role || "").trim().toLowerCase();
  if (role === "admin") return true;

  const { data: boardAdmin } = await adminClient
    .from("board_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(boardAdmin?.user_id);
}

export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(event?.headers);

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "허용되지 않은 메서드입니다." });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    logEvent("error", "admin_delete_post_env_missing", {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: 500,
    });
    return json(500, { ok: false, code: "MISSING_ENV", message: "서버 설정이 누락되었습니다." });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, code: "INVALID_JSON", message: "요청 형식이 올바르지 않습니다." });
  }

  const postId = parsePostId(body);
  if (!postId) {
    return json(400, { ok: false, code: "INVALID_POST_ID", message: "post_id가 올바르지 않습니다." });
  }

  const token = extractBearerToken(event);
  if (!token) return json(401, { ok: false, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await anonClient.auth.getUser(token);
  const requesterId = String(userData?.user?.id || "");
  if (authError || !requesterId) {
    return json(401, { ok: false, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const canDelete = await isAdminUser(adminClient, requesterId);
  if (!canDelete) {
    logEvent("warn", "admin_delete_post_forbidden", {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: 403,
      requester_id: requesterId.slice(0, 8),
    });
    return json(403, { ok: false, code: "FORBIDDEN", message: "권한이 없습니다." });
  }

  const { data: row, error: lookupError } = await adminClient
    .from("board_posts")
    .select("id,section_slug,is_deleted")
    .eq("id", postId)
    .maybeSingle();

  if (lookupError) {
    logEvent("error", "admin_delete_post_lookup_failed", {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: 500,
    });
    return json(500, { ok: false, code: "POST_LOOKUP_FAILED", message: "게시글 조회 실패" });
  }
  if (!row || row.is_deleted === true) {
    return json(404, { ok: false, code: "POST_NOT_FOUND", message: "게시글을 찾을 수 없습니다." });
  }

  const { error: updateError } = await adminClient
    .from("board_posts")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", postId);

  if (updateError) {
    logEvent("error", "admin_delete_post_update_failed", {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: 500,
    });
    return json(500, { ok: false, code: "DELETE_FAILED", message: "게시글 삭제 처리 실패" });
  }

  logEvent("info", "admin_delete_post_success", {
    request_id: requestId,
    duration_ms: Date.now() - startedAt,
    status_code: 200,
    post_id: postId,
  });

  return json(200, {
    ok: true,
    post_id: postId,
    section_slug: row.section_slug,
    request_id: requestId,
  });
}
