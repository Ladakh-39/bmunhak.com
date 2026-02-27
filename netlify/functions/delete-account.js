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

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "method_not_allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(500, { ok: false, message: "missing_env" });
  }

  const token = extractBearerToken(event);
  if (!token) return json(401, { ok: false, message: "로그인이 필요합니다." });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const userId = String(userData?.user?.id || "");
  if (userError || !userId) return json(401, { ok: false, message: "유효하지 않은 인증입니다." });

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json(500, { ok: false, message: deleteError.message || "delete_failed" });
  }

  return json(200, { ok: true });
}
