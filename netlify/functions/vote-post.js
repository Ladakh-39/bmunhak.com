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
  const found = Object.keys(headers).find((k) => String(k).toLowerCase() === String(name).toLowerCase());
  return found ? String(headers[found] || "") : "";
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

function parsePostId(body) {
  const n = Number(body?.post_id);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  const id = n;
  return id > 0 ? id : null;
}

function parseVote(body) {
  const n = Number(body?.vote);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  const vote = n;
  return vote === 1 || vote === -1 ? vote : null;
}

function hashIp(ip, salt) {
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (String(error.code || "") === "23505") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("duplicate key") || message.includes("unique");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const VIEW_IP_SALT = process.env.VIEW_IP_SALT;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !VIEW_IP_SALT) {
    return json(500, { ok: false, reason: "missing_env" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  const postId = parsePostId(body);
  const vote = parseVote(body);
  if (!postId || !vote) {
    return json(400, { ok: false, reason: "invalid_input" });
  }

  const token = extractBearerToken(event);
  if (!token) {
    return json(401, { ok: false, reason: "auth_required" });
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const userId = String(userData?.user?.id || "");
  if (userError || !userId) {
    return json(401, { ok: false, reason: "auth_required" });
  }

  const ip = extractClientIp(event);
  if (!ip) {
    return json(400, { ok: false, reason: "ip_unavailable" });
  }
  const ipHash = hashIp(ip, VIEW_IP_SALT);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: post, error: postError } = await admin
    .from("board_posts")
    .select("id,author_id,is_deleted")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    return json(500, { ok: false, reason: "post_lookup_failed" });
  }
  if (!post || post.is_deleted) {
    return json(404, { ok: false, reason: "post_not_found" });
  }
  if (userId === String(post.author_id || "")) {
    return json(403, { ok: false, reason: "self_vote" });
  }

  const { data: rpcData, error: rpcError } = await admin.rpc("board_post_apply_vote", {
    p_post_id: postId,
    p_user_id: userId,
    p_ip_hash: ipHash,
    p_vote: vote,
  });

  if (rpcError) {
    if (isUniqueViolation(rpcError)) {
      return json(409, { ok: false, reason: "already_voted" });
    }
    return json(500, { ok: false, reason: "vote_apply_failed" });
  }

  const row = Array.isArray(rpcData) ? (rpcData[0] || {}) : (rpcData || {});
  const likeCount = Number(row.like_count);
  const dislikeCount = Number(row.dislike_count);
  const changed = Boolean(row.changed);

  return json(200, {
    ok: true,
    like_count: Number.isFinite(likeCount) ? likeCount : 0,
    dislike_count: Number.isFinite(dislikeCount) ? dislikeCount : 0,
    changed,
  });
}
