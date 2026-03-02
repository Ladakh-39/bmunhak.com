import fs from "fs";
import path from "path";
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
const ASSISTANT_SUBJECTS = new Set(["korean", "math", "english"]);
const TA_ROLES = new Set(["assistant", "admin"]);
const ANSWER_CSV_PATH = path.join(process.cwd(), "netlify", "functions", "_private", "2027_mothertung_answers.csv");
const ANSWER_CACHE = { bySubject: null };

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

function toSafeFloat(value) {
  if (value === null || value === undefined) return NaN;
  const n = Number(String(value).replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAssistantSubject(value) {
  const subject = String(value || "").trim().toLowerCase();
  if (!ASSISTANT_SUBJECTS.has(subject)) return "";
  return subject;
}

function resolveExamScopeSubject(section) {
  const normalized = String(section || "").trim().toLowerCase();
  if (SUBJECTS.has(normalized)) return "korean";
  return "";
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

function parseCsvRow(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => String(v || "").replace(/^\uFEFF/, "").trim());
}

function findHeaderIndex(header, candidates) {
  if (!Array.isArray(header)) return -1;
  for (const key of candidates) {
    const idx = header.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeStarValue(rawStar, rawDifficulty) {
  const asNum = toSafeInt(rawStar);
  if (Number.isFinite(asNum) && asNum > 0) return Math.min(Math.max(asNum, 1), 5);
  const starChars = String(rawStar || "").match(/★/g);
  if (starChars?.length) return Math.min(Math.max(starChars.length, 1), 5);
  const d = String(rawDifficulty || "").trim().toLowerCase();
  if (d === "low") return 1;
  if (d === "medium" || d === "memium") return 2;
  if (d === "high") return 3;
  return null;
}

function normalizePCorrectValue(raw) {
  const n = toSafeFloat(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function loadAnswerDbFromCsv() {
  if (ANSWER_CACHE.bySubject) return ANSWER_CACHE.bySubject;
  if (!fs.existsSync(ANSWER_CSV_PATH)) throw new Error("ANSWER_CSV_NOT_FOUND");

  const text = fs.readFileSync(ANSWER_CSV_PATH, "utf-8").replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("ANSWER_CSV_EMPTY");

  const header = parseCsvRow(lines[0]);
  const idxCategory = findHeaderIndex(header, ["category", "section"]);
  const idxQuestion = findHeaderIndex(header, ["question_id", "item_no", "qno"]);
  const idxAnswer = findHeaderIndex(header, ["correct_answer", "answer"]);
  const idxStar = findHeaderIndex(header, ["stars", "difficulty_star", "difficultyStars"]);
  const idxDifficulty = findHeaderIndex(header, ["difficulty", "difficulty_level"]);
  const idxPCorrect = findHeaderIndex(header, ["p_correct", "correct_rate", "accuracy_rate"]);
  if (idxCategory < 0 || idxQuestion < 0 || idxAnswer < 0) throw new Error("ANSWER_CSV_BAD_HEADER");

  const bySubject = {};
  for (const subject of SUBJECTS) bySubject[subject] = new Map();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvRow(lines[i]);
    const subject = String(cols[idxCategory] || "").trim();
    const qnum = toSafeInt(cols[idxQuestion]);
    const answer = toSafeInt(cols[idxAnswer]);
    const stars = normalizeStarValue(idxStar >= 0 ? cols[idxStar] : "", idxDifficulty >= 0 ? cols[idxDifficulty] : "");
    const pCorrect = normalizePCorrectValue(idxPCorrect >= 0 ? cols[idxPCorrect] : "");
    if (!SUBJECTS.has(subject)) continue;
    if (!Number.isFinite(qnum) || qnum <= 0) continue;
    if (!Number.isFinite(answer) || answer < 1 || answer > 5) continue;

    bySubject[subject].set(qnum, {
      answer,
      stars: Number.isFinite(stars) ? stars : null,
      p_correct: Number.isFinite(pCorrect) ? pCorrect : null,
    });
  }

  ANSWER_CACHE.bySubject = bySubject;
  return bySubject;
}

function getAnswerRowsFromCsv(subject, startQ, endQ) {
  const bySubject = loadAnswerDbFromCsv();
  const answerMap = bySubject[subject];
  if (!answerMap || !answerMap.size) return [];

  const rows = [];
  for (let qnum = startQ; qnum <= endQ; qnum += 1) {
    const row = answerMap.get(qnum);
    const answer = toSafeInt(row?.answer);
    if (!Number.isFinite(answer)) continue;
    rows.push({
      qnum,
      answer,
      stars: Number.isFinite(toSafeInt(row?.stars)) ? toSafeInt(row?.stars) : null,
      p_correct: Number.isFinite(toSafeFloat(row?.p_correct)) ? toSafeFloat(row?.p_correct) : null,
    });
  }
  return rows;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { ok: false, error: "MISSING_ENV" });

    const accessToken = extractAccessToken(event);
    if (!accessToken) return json(401, { ok: false, error: "UNAUTHORIZED" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const userRes = await admin.auth.getUser(accessToken);
    const actorUserId = userRes?.data?.user?.id || "";
    if (userRes.error || !actorUserId) return json(401, { ok: false, error: "UNAUTHORIZED" });

    const { data: profile, error: perr } = await admin
      .from("profiles")
      .select("role,assistant_subject")
      .eq("user_id", actorUserId)
      .maybeSingle();

    if (perr) return json(500, { ok: false, error: "INTERNAL" });
    const role = normalizeRole(profile?.role);
    if (!TA_ROLES.has(role)) return json(403, { ok: false, error: "FORBIDDEN" });
    const assistantSubject = normalizeAssistantSubject(profile?.assistant_subject);

    const body = JSON.parse(event.body || "{}");
    const year = toSafeInt(body?.year);
    const subject = String(body?.subject || "").trim().toLowerCase();
    const startQ = toSafeInt(body?.startQ);
    const endQ = toSafeInt(body?.endQ);
    const targetStudentId = toSafeInt(body?.target_student_id);
    const answers = normalizeAnswerMap(body?.answers);

    if (!Number.isFinite(year) || !subject || !Number.isFinite(startQ) || !Number.isFinite(endQ) || !answers || !Number.isFinite(targetStudentId)) {
      return json(400, { ok: false, error: "BAD_REQUEST" });
    }
    if (!SUBJECTS.has(subject)) return json(400, { ok: false, error: "INVALID_SUBJECT" });
    if (startQ <= 0 || endQ <= 0 || startQ > endQ) return json(400, { ok: false, error: "INVALID_RANGE" });
    if (targetStudentId <= 0) return json(400, { ok: false, error: "INVALID_TARGET_STUDENT" });
    const examSubject = resolveExamScopeSubject(subject);
    if (!examSubject) return json(400, { ok: false, error: "INVALID_SUBJECT" });

    if (role === "assistant") {
      if (!assistantSubject) return json(403, { ok: false, error: "FORBIDDEN" });
      if (assistantSubject !== examSubject) return json(403, { ok: false, error: "FORBIDDEN" });
    }

    const { data: student, error: serr } = await admin
      .from("students")
      .select("id,name,user_id,grade_level,grade_year")
      .eq("id", targetStudentId)
      .maybeSingle();

    if (serr) return json(500, { ok: false, error: "INTERNAL" });
    if (!student) return json(404, { ok: false, error: "STUDENT_NOT_FOUND" });
    if (!student.user_id) return json(400, { ok: false, error: "STUDENT_USER_NOT_LINKED" });

    let rows = [];
    try {
      rows = getAnswerRowsFromCsv(subject, startQ, endQ);
    } catch (e) {
      return json(500, { ok: false, error: "ANSWER_SOURCE_FAILED" });
    }
    if (!rows?.length) return json(404, { ok: false, error: "ANSWER_NOT_FOUND" });

    let correct = 0;
    let attempted = 0;
    let unanswered = 0;

    const itemRows = [];
    for (const r of rows) {
      const qnum = toSafeInt(r?.qnum);
      const official = toSafeInt(r?.answer);
      const stars = Number.isFinite(toSafeInt(r?.stars)) ? toSafeInt(r?.stars) : null;
      const pCorrect = Number.isFinite(toSafeFloat(r?.p_correct)) ? toSafeFloat(r?.p_correct) : null;
      const my = toSafeInt(answers[qnum] ?? 0);

      if (!my) {
        unanswered += 1;
        itemRows.push({
          item_no: qnum,
          my_answer: null,
          is_correct: null,
          correct_answer: Number.isFinite(official) ? official : null,
          stars,
          p_correct: pCorrect,
        });
        continue;
      }

      attempted += 1;
      const isCorrect = my === official;
      if (isCorrect) correct += 1;
      itemRows.push({
        item_no: qnum,
        my_answer: my,
        is_correct: isCorrect,
        correct_answer: Number.isFinite(official) ? official : null,
        stars,
        p_correct: pCorrect,
      });
    }

    const wrong = attempted - correct;

    const { data: attempt, error: aerr } = await admin
      .from("exam_attempts")
      .insert({
        user_id: student.user_id,
        year,
        section: subject,
        form: "na",
        raw_score: correct,
        official_total: rows.length,
      })
      .select("id")
      .single();

    if (aerr) return json(500, { ok: false, error: "ATTEMPT_INSERT_FAILED" });

    const attemptId = attempt.id;
    const payloadItems = itemRows.map((it) => ({
      attempt_id: attemptId,
      item_no: it.item_no,
      my_answer: it.my_answer,
      is_correct: it.is_correct,
      correct_answer: it.correct_answer,
      p_correct: it.p_correct,
    }));

    if (payloadItems.length) {
      const { error: ierr } = await admin.from("exam_attempt_items").insert(payloadItems);
      if (ierr) return json(500, { ok: false, error: "ITEMS_INSERT_FAILED" });
    }

    const wrongDetails = itemRows
      .filter((it) => Number.isFinite(toSafeInt(it.my_answer)) && it.is_correct === false)
      .map((it) => ({
        item_no: it.item_no,
        my_answer: it.my_answer,
        correct_answer: it.correct_answer,
        stars: it.stars,
        p_correct: it.p_correct,
      }));

    return json(200, {
      ok: true,
      attempt_id: attemptId,
      summary: { total: rows.length, attempted, correct, wrong, unanswered },
      items: itemRows,
      wrong_details: wrongDetails,
      target_student: {
        id: student.id,
        name: student.name,
        user_id: student.user_id,
        grade_level: student.grade_level,
        grade_year: student.grade_year,
      },
      saved_by: actorUserId,
    });
  } catch (e) {
    return json(500, { ok: false, error: "INTERNAL" });
  }
}
