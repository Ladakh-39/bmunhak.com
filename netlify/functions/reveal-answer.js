import fs from "fs";
import path from "path";
import crypto from "crypto";

const WINDOW_MS = 10 * 1000;
const LIMIT_COUNT = 3;
const rateLimitStore = new Map();

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
  const v = String(value || "").trim().toLowerCase();
  return v === "lang" || v === "logic" ? v : "";
}

function normalizeForm(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "odd" || v === "even") return v;
  return "";
}

function normalizeQuestionNo(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 80) return null;
  return i;
}

function toAnswerInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 1 && i <= 5 ? i : null;
}

function checkRateLimit({ ip, year, section }) {
  const key = `${String(ip || "unknown")}|${String(year || "")}|${String(section || "")}`;
  const now = Date.now();
  const list = rateLimitStore.get(key) || [];
  const valid = list.filter((ts) => now - ts <= WINDOW_MS);
  if (valid.length >= LIMIT_COUNT) {
    rateLimitStore.set(key, valid);
    return false;
  }
  valid.push(now);
  rateLimitStore.set(key, valid);
  return true;
}

function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, list] of rateLimitStore.entries()) {
    const valid = (list || []).filter((ts) => now - ts <= WINDOW_MS);
    if (!valid.length) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, valid);
    }
  }
}

export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(event?.headers);
  const rawIp = getClientIp(event?.headers);
  const clientIpMasked = maskIp(rawIp);
  const respond = (statusCode, body, level = "info", eventName = "reveal_answer_response", extra = {}) => {
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
    cleanupRateLimitStore();

    if (event.httpMethod !== "POST") {
      return respond(405, { ok: false, message: "허용되지 않은 메서드입니다." }, "warn", "reveal_answer_method_not_allowed");
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return respond(400, { ok: false, message: "요청 형식이 올바르지 않습니다." }, "warn", "reveal_answer_invalid_json");
    }

    const year = String(body?.year || "").trim();
    const section = normalizeSection(body?.section);
    const form = normalizeForm(body?.form) || "odd";
    const qno = normalizeQuestionNo(body?.qno);

    if (!year || !section || !qno) {
      return respond(400, { ok: false, message: "요청 값이 올바르지 않습니다." }, "warn", "reveal_answer_invalid_request");
    }

    const allowed = checkRateLimit({ ip: rawIp || "unknown", year, section });
    if (!allowed) {
      return respond(429, { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, "warn", "reveal_answer_rate_limited", {
        year,
        section,
      });
    }

    const dbPath = path.join(process.cwd(), "netlify", "functions", "_private", "leet_private_db.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    const pack = db?.[section]?.[year];
    if (!pack) {
      return respond(404, { ok: false, message: "시험 데이터를 찾을 수 없습니다." }, "warn", "reveal_answer_exam_not_found", {
        year,
        section,
      });
    }

    const arr = (form === "even" ? pack?.even_answers : pack?.odd_answers) || pack?.answers || [];
    const answer = toAnswerInt(arr[qno]);
    if (answer == null) {
      return respond(404, { ok: false, message: "문항 정답을 찾을 수 없습니다." }, "warn", "reveal_answer_not_found", {
        year,
        section,
        qno,
      });
    }

    return respond(200, {
      ok: true,
      year,
      section,
      qno,
      answer: String(answer),
    }, "info", "reveal_answer_success", { year, section, qno });
  } catch {
    return respond(500, { ok: false, message: "서버 오류가 발생했습니다." }, "error", "reveal_answer_unhandled_error");
  }
}
