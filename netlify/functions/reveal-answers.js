import fs from "fs";
import path from "path";
import crypto from "crypto";

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

function requestIdFrom(event) {
  const headers = event?.headers || {};
  const key = Object.keys(headers).find((k) => String(k).toLowerCase() === "x-request-id");
  if (key && headers[key]) return String(headers[key]).slice(0, 64);
  return crypto.randomUUID();
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

function normalizeSection(value) {
  const s = String(value || "").trim().toLowerCase();
  return s === "lang" || s === "logic" ? s : "";
}

function normalizeForm(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "odd" || v === "even" ? v : "";
}

function normalizeQuestionIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isFinite(n)) continue;
    const q = Math.trunc(n);
    if (q < 1 || q > 80) continue;
    if (seen.has(q)) continue;
    seen.add(q);
    out.push(q);
  }
  return out;
}

function toAnswerInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 1 && i <= 5 ? i : null;
}

export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(event);
  const respond = (statusCode, body, level = "info", eventName = "reveal_answers_response") => {
    logEvent(level, eventName, {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: statusCode,
    });
    return json(statusCode, body);
  };

  try {
    if (event.httpMethod !== "POST") {
      return respond(405, { ok: false, error: "method_not_allowed" }, "warn", "reveal_answers_method_not_allowed");
    }

    const body = JSON.parse(event.body || "{}");
    const year = String(body?.year || "").trim();
    const section = normalizeSection(body?.section);
    const form = normalizeForm(body?.form);
    const qids = normalizeQuestionIds(body?.question_ids);

    if (!year || !section || !form || !qids.length) {
      return respond(400, { ok: false, error: "invalid_request" }, "warn", "reveal_answers_invalid_request");
    }

    const dbPath = path.join(process.cwd(), "netlify", "functions", "_private", "leet_private_db.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    const pack = db?.[section]?.[year];
    if (!pack) {
      return respond(404, { ok: false, error: "exam_not_found" }, "warn", "reveal_answers_exam_not_found");
    }

    const arr = (form === "even" ? pack?.even_answers : pack?.odd_answers) || pack?.answers || [];
    const answers = {};
    for (const q of qids) {
      const ans = toAnswerInt(arr[q]);
      if (ans != null) answers[String(q)] = ans;
    }

    return respond(200, {
      ok: true,
      year,
      section,
      form,
      answers,
    });
  } catch (error) {
    logEvent("error", "reveal_answers_unhandled_error", {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: 500,
      error: String(error?.message || "unknown_error"),
    });
    return json(500, { ok: false, error: "server_error" });
  }
}

