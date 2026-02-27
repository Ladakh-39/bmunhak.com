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

function maskUserId(userId) {
  const value = String(userId || "");
  if (!value) return "";
  return value.slice(0, 8);
}

function getClientIp(headers) {
  const forwarded = getHeader(headers, "x-forwarded-for");
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return getHeader(headers, "x-nf-client-connection-ip") || getHeader(headers, "client-ip") || "";
}

function maskIp(ip) {
  const raw = String(ip || "").trim();
  if (!raw) return "";
  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (raw.includes(":")) {
    const parts = raw.split(":").filter(Boolean);
    return `${parts.slice(0, 2).join(":")}:*`;
  }
  return "";
}

function isMissingRelationError(error, relationName) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes(String(relationName || "").toLowerCase()) && msg.includes("does not exist");
}

function isMissingColumnError(err, col) {
  const msg = String(err?.message || "");
  return msg.includes(`column "${col}"`) && msg.includes("does not exist");
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

  const { data: boardAdmin, error } = await adminClient
    .from("board_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && isMissingRelationError(error, "board_admins")) return false;
  return Boolean(boardAdmin?.user_id);
}

export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(event?.headers);
  const clientIpMasked = maskIp(getClientIp(event?.headers));
  const respond = (statusCode, body, level = "info", eventName = "delete_post_response", extra = {}) => {
    logEvent(level, eventName, {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: statusCode,
      client_ip: clientIpMasked,
      ...extra,
    });
    return json(statusCode, body);
  };

  try {
    if (event.httpMethod !== "POST") {
      return respond(405, { ok: false, message: "허용되지 않은 메서드입니다." }, "warn", "delete_post_method_not_allowed");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return respond(500, { ok: false, message: "서버 설정이 누락되었습니다." }, "error", "delete_post_env_missing");
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return respond(400, { ok: false, message: "요청 형식이 올바르지 않습니다." }, "warn", "delete_post_invalid_json");
    }

    const postId = parsePostId(body);
    if (!postId) {
      return respond(400, { ok: false, message: "post_id가 올바르지 않습니다." }, "warn", "delete_post_invalid_post_id");
    }

    const token = extractBearerToken(event);
    if (!token) {
      return respond(401, { ok: false, message: "로그인이 필요합니다." }, "warn", "delete_post_unauthorized_no_token");
    }

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);
    const requesterId = String(userData?.user?.id || "");
    if (authError || !requesterId) {
      return respond(401, { ok: false, message: "로그인이 필요합니다." }, "warn", "delete_post_unauthorized_invalid_token");
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const deleteColumnCandidates = ["is_deleted", "is_delted"];
    let lookupDeleteColumn = null;
    let row = null;

    for (const col of deleteColumnCandidates) {
      const { data, error } = await adminClient
        .from("board_posts")
        .select(`id,author_id,section_slug,${col}`)
        .eq("id", postId)
        .maybeSingle();

      if (!error) {
        row = data || null;
        lookupDeleteColumn = col;
        break;
      }
      if (isMissingColumnError(error, col)) continue;

      return respond(500, { ok: false, message: "게시글 조회에 실패했습니다." }, "error", "delete_post_lookup_failed", {
        requester_id: maskUserId(requesterId),
      });
    }

    if (!row) {
      const { data, error } = await adminClient
        .from("board_posts")
        .select("id,author_id,section_slug")
        .eq("id", postId)
        .maybeSingle();

      if (error) {
        return respond(500, { ok: false, message: "게시글 조회에 실패했습니다." }, "error", "delete_post_lookup_failed", {
          requester_id: maskUserId(requesterId),
        });
      }
      row = data || null;
    }

    if (!row || (lookupDeleteColumn && row[lookupDeleteColumn] === true)) {
      return respond(404, { ok: false, message: "게시글을 찾을 수 없습니다." }, "warn", "delete_post_not_found", {
        requester_id: maskUserId(requesterId),
      });
    }

    const isAdmin = await isAdminUser(adminClient, requesterId);
    const isOwner = String(row.author_id || "") === requesterId;
    if (!isAdmin && !isOwner) {
      return respond(403, { ok: false, message: "권한이 없습니다." }, "warn", "delete_post_forbidden", {
        requester_id: maskUserId(requesterId),
      });
    }

    let softDeleteColumnUsed = null;
    let lastErr = null;
    for (const col of deleteColumnCandidates) {
      const patch = { deleted_at: new Date().toISOString() };
      patch[col] = true;

      const { error } = await adminClient
        .from("board_posts")
        .update(patch)
        .eq("id", postId);

      if (!error) {
        softDeleteColumnUsed = col;
        lastErr = null;
        break;
      }
      if (isMissingColumnError(error, col)) {
        lastErr = error;
        continue;
      }
      throw error;
    }

    if (!softDeleteColumnUsed) {
      const detail = String(lastErr?.message || "soft-delete column missing");
      return respond(
        500,
        {
          ok: false,
          error: "SOFT_DELETE_COLUMN_MISSING",
          message: "board_posts에 is_deleted/is_delted 컬럼이 모두 없어 soft-delete를 수행할 수 없습니다.",
          detail,
        },
        "error",
        "delete_post_soft_delete_column_missing",
        {
          requester_id: maskUserId(requesterId),
          post_id: postId,
        }
      );
    }

    return respond(
      200,
      { ok: true, post_id: postId, section_slug: row.section_slug, soft_delete_column: softDeleteColumnUsed },
      "info",
      "delete_post_success",
      {
        requester_id: maskUserId(requesterId),
        post_id: postId,
        role: isAdmin ? "admin" : "owner",
        soft_delete_column: softDeleteColumnUsed,
      }
    );
  } catch {
    return respond(500, { ok: false, message: "서버 오류가 발생했습니다." }, "error", "delete_post_unhandled_error");
  }
}
