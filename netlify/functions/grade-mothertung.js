import { createClient } from "@supabase/supabase-js";

const SUBJECTS = new Set([
  "humanities",
  "social",
  "science",
  "tech",
  "art",
  "mixed",
  "mock1",
  "mock2",
]);

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

function toSafeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

function normalizeAnswerMap(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) return null;
  const out = {};
  for (const [key, value] of Object.entries(rawAnswers)) {
    const qnum = toSafeInt(key);
    if (!Number.isFinite(qnum) || qnum <= 0) continue;
    const ans = toSafeInt(value);
    if (Number.isFinite(ans) && ans >= 1 && ans <= 5) out[qnum] = ans;
  }
  return out;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { ok: false, error: "MISSING_ENV" });

    const accessToken = extractAccessToken(event);
    if (!accessToken) return json(401, { ok: false, error: "UNAUTHORIZED" });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userRes = await sb.auth.getUser(accessToken);
    const authedUserId = userRes?.data?.user?.id || "";
    if (userRes.error || !authedUserId) return json(401, { ok: false, error: "UNAUTHORIZED" });

    const body = JSON.parse(event.body || "{}");
    const year = toSafeInt(body?.year);
    const subject = String(body?.subject || "").trim();
    const startQ = toSafeInt(body?.startQ);
    const endQ = toSafeInt(body?.endQ);
    const userId = String(body?.user_id || "").trim();
    const answers = normalizeAnswerMap(body?.answers);

    if (!Number.isFinite(year) || !subject || !Number.isFinite(startQ) || !Number.isFinite(endQ) || !answers || !userId) {
      return json(400, { ok: false, error: "BAD_REQUEST" });
    }
    if (!SUBJECTS.has(subject)) return json(400, { ok: false, error: "INVALID_SUBJECT" });
    if (startQ <= 0 || endQ <= 0 || startQ > endQ) return json(400, { ok: false, error: "INVALID_RANGE" });
    if (userId !== authedUserId) return json(403, { ok: false, error: "USER_MISMATCH" });

    const { data: rows, error: qerr } = await sb
      .from("mothertung_answers")
      .select("qnum,answer")
      .eq("year", year)
      .eq("subject", subject)
      .gte("qnum", startQ)
      .lte("qnum", endQ)
      .order("qnum", { ascending: true });

    if (qerr) return json(500, { ok: false, error: "ANSWER_QUERY_FAILED", detail: qerr.message });
    if (!rows?.length) return json(404, { ok: false, error: "ANSWER_NOT_FOUND" });

    let correct = 0;
    let attempted = 0;
    let unanswered = 0;

    const itemRows = [];
    for (const r of rows) {
      const qnum = toSafeInt(r?.qnum);
      const official = toSafeInt(r?.answer);
      const my = toSafeInt(answers[qnum] ?? 0);

      if (!my) {
        unanswered += 1;
        itemRows.push({ item_no: qnum, my_answer: null, is_correct: null });
        continue;
      }

      attempted += 1;
      const isCorrect = my === official;
      if (isCorrect) correct += 1;
      itemRows.push({ item_no: qnum, my_answer: my, is_correct: isCorrect });
    }

    const wrong = attempted - correct;

    const { data: attempt, error: aerr } = await sb
      .from("exam_attempts")
      .insert({
        user_id: userId,
        year,
        section: subject,
        form: "na",
        raw_score: correct,
        official_total: rows.length,
      })
      .select("id")
      .single();

    if (aerr) return json(500, { ok: false, error: "ATTEMPT_INSERT_FAILED", detail: aerr.message });

    const attemptId = attempt.id;
    const payloadItems = itemRows.map((it) => ({
      attempt_id: attemptId,
      item_no: it.item_no,
      my_answer: it.my_answer,
      is_correct: it.is_correct,
    }));

    if (payloadItems.length) {
      const { error: ierr } = await sb.from("exam_attempt_items").insert(payloadItems);
      if (ierr) return json(500, { ok: false, error: "ITEMS_INSERT_FAILED", detail: ierr.message });
    }

    return json(200, {
      ok: true,
      attempt_id: attemptId,
      summary: { total: rows.length, attempted, correct, wrong, unanswered },
    });
  } catch (e) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(e?.message || e) });
  }
}
