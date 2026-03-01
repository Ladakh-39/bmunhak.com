import { createClient } from "@supabase/supabase-js";

const ALLOWED_LEVELS = new Set(["중등", "고등"]);
const ALLOWED_YEARS = new Set([1, 2, 3]);
const TA_ROLES = new Set(["assistant", "admin"]);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
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

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "GET") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { ok: false, error: "MISSING_ENV" });

    const accessToken = extractAccessToken(event);
    if (!accessToken) return json(401, { ok: false, error: "UNAUTHORIZED" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userRes = await admin.auth.getUser(accessToken);
    const userId = userRes?.data?.user?.id || "";
    if (userRes.error || !userId) return json(401, { ok: false, error: "UNAUTHORIZED" });

    const { data: profile, error: perr } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (perr) return json(500, { ok: false, error: "PROFILE_LOOKUP_FAILED", detail: perr.message });
    const role = normalizeRole(profile?.role);
    if (!TA_ROLES.has(role)) return json(403, { ok: false, error: "FORBIDDEN" });

    const gradeLevel = String(event?.queryStringParameters?.grade_level || "").trim();
    const gradeYear = Number(event?.queryStringParameters?.grade_year || 0);
    if (!ALLOWED_LEVELS.has(gradeLevel) || !ALLOWED_YEARS.has(gradeYear)) {
      return json(400, { ok: false, error: "INVALID_FILTER" });
    }

    const { data: rows, error } = await admin
      .from("students")
      .select("id,name,user_id,grade_level,grade_year")
      .eq("grade_level", gradeLevel)
      .eq("grade_year", gradeYear)
      .order("name", { ascending: true })
      .limit(500);

    if (error) return json(500, { ok: false, error: "STUDENTS_QUERY_FAILED", detail: error.message });

    return json(200, {
      ok: true,
      grade_level: gradeLevel,
      grade_year: gradeYear,
      students: Array.isArray(rows) ? rows : [],
    });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}
