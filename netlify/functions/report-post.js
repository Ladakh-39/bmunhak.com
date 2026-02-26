import { createClient } from "@supabase/supabase-js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const key = Object.keys(headers).find((item) => String(item).toLowerCase() === String(name).toLowerCase());
  return key ? String(headers[key] || "") : "";
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

function isUniqueViolation(error) {
  if (!error) return false;
  if (String(error.code || "") === "23505") return true;
  const msg = String(error.message || "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique");
}

function isMissingSchema(error, keyword) {
  const msg = String(error?.message || "").toLowerCase();
  const key = String(keyword || "").toLowerCase();
  return msg.includes(key) && (msg.includes("does not exist") || msg.includes("schema cache"));
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "method_not_allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(500, { ok: false, message: "missing_env" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, message: "invalid_json" });
  }
  const postId = parsePostId(body);
  if (!postId) return json(400, { ok: false, message: "invalid_post_id" });

  const token = extractBearerToken(event);
  if (!token) return json(401, { ok: false, message: "로그인이 필요합니다." });

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: authError } = await anonClient.auth.getUser(token);
  const reporterId = String(userData?.user?.id || "");
  if (authError || !reporterId) return json(401, { ok: false, message: "로그인이 필요합니다." });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let { data: post, error: postError } = await admin
    .from("board_posts")
    .select("id,author_id,is_deleted,like_count,report_count,is_hidden")
    .eq("id", postId)
    .maybeSingle();

  if (postError && (isMissingSchema(postError, "report_count") || isMissingSchema(postError, "is_hidden"))) {
    return json(503, { ok: false, message: "신고 기능은 준비중입니다. 관리자 설정이 필요합니다." });
  }
  if (postError) return json(500, { ok: false, message: "post_lookup_failed" });
  if (!post || post.is_deleted) return json(404, { ok: false, message: "post_not_found" });

  if (String(post.author_id || "") === reporterId) {
    return json(403, { ok: false, message: "본인 글은 신고할 수 없습니다." });
  }

  const { error: insertError } = await admin.from("board_post_reports").insert({
    post_id: postId,
    reporter_id: reporterId
  });

  if (insertError) {
    if (isUniqueViolation(insertError)) return json(409, { ok: false, message: "already_reported" });
    if (isMissingSchema(insertError, "board_post_reports")) {
      return json(503, { ok: false, message: "신고 기능은 준비중입니다. 관리자 설정이 필요합니다." });
    }
    return json(500, { ok: false, message: "report_insert_failed" });
  }

  const { count: reportCount, error: countError } = await admin
    .from("board_post_reports")
    .select("id", { head: true, count: "exact" })
    .eq("post_id", postId);
  if (countError) return json(500, { ok: false, message: "report_count_failed" });

  const likeCount = Number(post.like_count || 0);
  const finalReportCount = Number(reportCount || 0);
  const threshold = likeCount <= 1 ? 3 : Math.floor(likeCount / 2) + 1;
  const shouldHide = finalReportCount >= threshold;

  const updatePayload = {
    report_count: finalReportCount,
    is_hidden: shouldHide,
    hidden_at: shouldHide ? new Date().toISOString() : null
  };

  const { error: updateError } = await admin
    .from("board_posts")
    .update(updatePayload)
    .eq("id", postId);

  if (updateError) {
    if (isMissingSchema(updateError, "report_count") || isMissingSchema(updateError, "is_hidden")) {
      return json(503, { ok: false, message: "신고 기능은 준비중입니다. 관리자 설정이 필요합니다." });
    }
    return json(500, { ok: false, message: "post_update_failed" });
  }

  return json(200, {
    ok: true,
    report_count: finalReportCount,
    threshold,
    is_hidden: shouldHide
  });
}
