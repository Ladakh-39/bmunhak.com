import { createClient } from "@supabase/supabase-js";

const STAFF_ROLES = new Set(["admin", "assistant"]);
const ALLOWED_LEVELS = new Set(["중등", "고등"]);
const ALLOWED_YEARS = new Set([1, 2, 3]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

export function toSafeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

export function isValidGradeLevel(value) {
  return ALLOWED_LEVELS.has(String(value || "").trim());
}

export function isValidGradeYear(value) {
  return ALLOWED_YEARS.has(toSafeInt(value));
}

export function isValidUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function maskEmail(raw) {
  const email = String(raw || "").trim();
  const at = email.indexOf("@");
  if (at <= 0) return "";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return "";

  const safeLocal = local.length <= 2
    ? `${local[0] || "*"}*`
    : `${local.slice(0, 2)}***`;

  const dot = domain.lastIndexOf(".");
  if (dot <= 0) return `${safeLocal}@${domain[0] || "*"}***`;
  const host = domain.slice(0, dot);
  const tld = domain.slice(dot);
  return `${safeLocal}@${host[0] || "*"}***${tld}`;
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

export function extractAccessToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (authz && /^Bearer\s+/i.test(authz)) return authz.replace(/^Bearer\s+/i, "").trim();
  return tokenFromCookieHeader(getHeader(event?.headers, "cookie"));
}

export function parseJsonBody(event) {
  try {
    return JSON.parse(event?.body || "{}");
  } catch (_err) {
    return null;
  }
}

async function requireRole(event, allowedMethods, allowedRoles) {
  if (!allowedMethods.includes(event?.httpMethod)) {
    return { ok: false, response: json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return { ok: false, response: json(500, { ok: false, error: "MISSING_ENV" }) };
  }

  const accessToken = extractAccessToken(event);
  if (!accessToken) {
    return { ok: false, response: json(401, { ok: false, error: "UNAUTHORIZED" }) };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userRes = await admin.auth.getUser(accessToken);
  const actorUserId = userRes?.data?.user?.id || "";
  if (userRes.error || !actorUserId) {
    return { ok: false, response: json(401, { ok: false, error: "UNAUTHORIZED" }) };
  }

  const { data: profile, error: perr } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", actorUserId)
    .maybeSingle();
  if (perr) {
    return { ok: false, response: json(500, { ok: false, error: "INTERNAL" }) };
  }

  const role = normalizeRole(profile?.role);
  if (!allowedRoles.has(role)) {
    return { ok: false, response: json(403, { ok: false, error: "FORBIDDEN" }) };
  }

  return { ok: true, admin, actorUserId, role };
}

export async function requireStaff(event, allowedMethods = ["GET", "POST"]) {
  return requireRole(event, allowedMethods, STAFF_ROLES);
}

export async function requireAdmin(event, allowedMethods = ["GET", "POST"]) {
  return requireRole(event, allowedMethods, new Set(["admin"]));
}
