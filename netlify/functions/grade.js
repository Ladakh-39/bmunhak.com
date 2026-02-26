import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/* -------------------- response helper -------------------- */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}


function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const keys = Object.keys(headers);
  const hit = keys.find((k) => String(k).toLowerCase() === String(name).toLowerCase());
  return hit ? String(headers[hit] || "") : "";
}

function tokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return "";
  const parts = String(cookieHeader).split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim();
    const value = p.slice(idx + 1).trim();
    if (!value) continue;
    if (key === "sb-access-token" || key === "access_token" || key === "access-token") {
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return "";
}

function extractAccessToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (authz && /^Bearer\s+/i.test(authz)) {
    return authz.replace(/^Bearer\s+/i, "").trim();
  }
  const cookieHeader = getHeader(event?.headers, "cookie");
  return tokenFromCookieHeader(cookieHeader);
}

function extractBearerToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (!authz || !/^Bearer\s+/i.test(authz)) return "";
  return authz.replace(/^Bearer\s+/i, "").trim();
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getUserFromToken(admin, accessToken) {
  if (!admin || !accessToken) return null;
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data?.user?.id) return null;
  return data.user;
}

function isColumnMissingError(error) {
  const msg = String(error?.message || "");
  return /column .* does not exist/i.test(msg) || /Could not find the .* column/i.test(msg);
}

async function canViewTotalApprox(event) {
  const accessToken = extractAccessToken(event);
  if (!accessToken) return false;
  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  try {
    const user = await getUserFromToken(admin, accessToken);
    return !!user?.id;
  } catch {
    return false;
  }
}
/* -------------------- file helpers -------------------- */
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readLinesUtf8Sig(filePath) {
  // ✅ BOM 제거 + CRLF 정리
  const text = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return text.replace(/\r/g, "").split("\n").filter(Boolean);
}

function requestIdFrom(event) {
  const fromHeader = getHeader(event?.headers, "x-request-id");
  if (fromHeader) return String(fromHeader).slice(0, 64);
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

function parseCsvRow(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        cur += "\"";
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

function shouldHideStar(year) {
  const y = String(year || "");
  return y === "2009_pre" || y === "2009" || y === "2010";
}

function normalizeStarValue(rawStar, rawDifficulty) {
  const asNum = Number(rawStar);
  if (Number.isFinite(asNum) && asNum > 0) return Math.trunc(asNum);
  const d = String(rawDifficulty || "").trim().toLowerCase();
  if (d === "low") return 1;
  if (d === "medium" || d === "memium") return 2;
  if (d === "high") return 3;
  return null;
}

const STAR_CACHE = { lang: null, logic: null };
const STAR_FILE = {
  lang: "leet_lang_master_sheet_EN_star.csv",
  logic: "leet_logic_master_sheet_EN_star.csv",
};

function loadStarDataset(section) {
  if (STAR_CACHE[section]) return STAR_CACHE[section];
  const file = STAR_FILE[section];
  if (!file) return {};
  const filePath = path.join(process.cwd(), "netlify", "functions", "_private", file);
  if (!fs.existsSync(filePath)) {
    STAR_CACHE[section] = {};
    return STAR_CACHE[section];
  }
  const lines = readLinesUtf8Sig(filePath);
  if (!lines.length) {
    STAR_CACHE[section] = {};
    return STAR_CACHE[section];
  }

  const header = parseCsvRow(lines[0]);
  const idxYear = header.indexOf("year");
  const idxQid = header.indexOf("question_id");
  const idxDiff = header.indexOf("difficulty");
  const idxStar = header.indexOf("difficulty_star");
  if (idxYear < 0 || idxQid < 0 || idxDiff < 0 || idxStar < 0) {
    STAR_CACHE[section] = {};
    return STAR_CACHE[section];
  }

  const dataset = {};
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvRow(lines[i]);
    const year = String(cols[idxYear] || "").trim();
    const qid = Number(cols[idxQid]);
    if (!year || !Number.isFinite(qid)) continue;
    const star = normalizeStarValue(cols[idxStar], cols[idxDiff]);
    if (!Number.isFinite(star)) continue;
    if (!dataset[year]) dataset[year] = {};
    dataset[year][String(Math.trunc(qid))] = Math.trunc(star);
  }
  STAR_CACHE[section] = dataset;
  return dataset;
}

function getSectionQuestionIds({ year, section, form, db }) {
  const sectionPack = getSectionPack({ year, section, form, db });
  if (!sectionPack) return [];
  const { correctArr, totalOfficial } = sectionPack;
  const out = [];
  for (let q = 1; q <= totalOfficial; q += 1) {
    if (toAnswerInt(correctArr[q]) != null) out.push(q);
  }
  return out;
}

function buildStarsForSection({ year, section, qIds }) {
  const out = {};
  const ids = Array.isArray(qIds) ? qIds : [];
  if (!ids.length) return out;
  if (shouldHideStar(year)) {
    ids.forEach((q) => { out[String(q)] = null; });
    return out;
  }
  const dataset = loadStarDataset(section);
  const byYear = dataset?.[String(year)] || {};
  ids.forEach((q) => {
    const key = String(q);
    out[key] = Number.isFinite(Number(byYear[key])) ? Math.trunc(Number(byYear[key])) : null;
  });
  return out;
}

/* -------------------- exam spec -------------------- */
function baseYearOf(yearStr) {
  const m = /^(\d{4})(_pre)?$/.exec(String(yearStr));
  return m ? parseInt(m[1], 10) : NaN;
}

function getExamSpec(yearStr, section) {
  const y = baseYearOf(yearStr);
  if (!Number.isFinite(y)) return null;

  if (section === "lang") {
    if (y === 2009) return { total: 40, indep: 4 };
    if (y >= 2010 && y <= 2013) return { total: 35, indep: 3 };
    if (y >= 2014 && y <= 2018) return { total: 35, indep: 0 };
    if (y >= 2019 && y <= 2026) return { total: 30, indep: 0 };
  }

  if (section === "logic") {
    if (y === 2009) return { total: 40, indep: 0 };
    if (y >= 2010 && y <= 2018) return { total: 35, indep: 0 };
    if (y >= 2019 && y <= 2026) return { total: 40, indep: 0 };
  }

  return null;
}

function fallbackSpecFromAnswers(correctArr) {
  let total = 0;
  for (let q = 1; q < correctArr.length; q++) {
    if (correctArr[q] != null) total += 1;
  }
  return { total, indep: 0 };
}

function isIndependentQ(q, indepCount) {
  return indepCount > 0 && q >= 1 && q <= indepCount;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function toAnswerInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 1 && i <= 5 ? i : null;
}

function countAnsweredAnswers(answers) {
  if (!answers || typeof answers !== "object") return 0;
  let count = 0;
  for (const value of Object.values(answers)) {
    if (toAnswerInt(value) != null) count += 1;
  }
  return count;
}

function normalizeSection(value) {
  const section = String(value || "").trim().toLowerCase();
  return section === "lang" || section === "logic" ? section : "";
}

function deriveRequestedSection(body) {
  const explicit = normalizeSection(body?.section);
  if (explicit) return explicit;
  const langCount = countAnsweredAnswers(body?.lang_answers);
  const logicCount = countAnsweredAnswers(body?.logic_answers);
  if (langCount > 0 && logicCount <= 0) return "lang";
  if (logicCount > 0 && langCount <= 0) return "logic";
  return "";
}

async function getProfileCreatedAt(admin, userId) {
  if (!admin || !userId) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.created_at) return null;
  const t = Date.parse(data.created_at);
  return Number.isFinite(t) ? t : null;
}

function isMissingColumn(error, column) {
  const msg = String(error?.message || "").toLowerCase();
  const col = String(column || "").toLowerCase();
  return msg.includes(col) && (msg.includes("does not exist") || msg.includes("schema cache"));
}

async function getLatestAttempt(admin, userId) {
  if (!admin || !userId) return null;

  const queryWithViewedAt = (withDeletedFilter) => {
    let query = admin
      .from("exam_attempts")
      .select("id,year,section,created_at,viewed_at")
      .eq("user_id", userId);
    if (withDeletedFilter) query = query.eq("is_deleted", false);
    return query
      .order("viewed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  };
  const queryWithoutViewedAt = (withDeletedFilter) => {
    let query = admin
      .from("exam_attempts")
      .select("id,year,section,created_at")
      .eq("user_id", userId);
    if (withDeletedFilter) query = query.eq("is_deleted", false);
    return query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  };

  let { data, error } = await queryWithViewedAt(true);
  if (error && isMissingColumn(error, "is_deleted")) {
    ({ data, error } = await queryWithViewedAt(false));
  }
  if (error && isMissingColumn(error, "viewed_at")) {
    ({ data, error } = await queryWithoutViewedAt(true));
    if (error && isMissingColumn(error, "is_deleted")) {
      ({ data, error } = await queryWithoutViewedAt(false));
    }
  }

  if (error) return null;
  return data || null;
}

function toPositiveRetry(requiredMin, elapsedMin) {
  const left = Math.ceil(requiredMin - elapsedMin);
  return left > 0 ? left : 1;
}

async function checkGradeWindow({ admin, user, reqYear, reqSection }) {
  if (!admin || !user?.id || !reqSection || !Number.isFinite(reqYear)) {
    return { blocked: false };
  }

  const nowMs = Date.now();
  const profileCreatedAt = await getProfileCreatedAt(admin, user.id);
  if (Number.isFinite(profileCreatedAt) && nowMs - profileCreatedAt < (7 * DAY_MS)) {
    return { blocked: false, exempt: "new_user_7d" };
  }

  const last = await getLatestAttempt(admin, user.id);
  if (!last) return { blocked: false };

  const refAt = last.viewed_at || last.created_at;
  const refMs = Date.parse(refAt || "");
  if (!Number.isFinite(refMs)) return { blocked: false };

  const elapsedMin = Math.max(0, (nowMs - refMs) / MINUTE_MS);
  const lastSection = normalizeSection(last.section);
  const lastYear = baseYearOf(last.year);

  if (lastSection === "lang" && reqSection === "lang" && elapsedMin < 55) {
    return {
      blocked: true,
      rule: "lang_to_lang_55m",
      retry_after_minutes: toPositiveRetry(55, elapsedMin),
      reason: "too_early"
    };
  }

  if (lastSection === "logic" && reqSection === "logic" && elapsedMin < 110) {
    return {
      blocked: true,
      rule: "logic_to_logic_110m",
      retry_after_minutes: toPositiveRetry(110, elapsedMin),
      reason: "too_early"
    };
  }

  if (lastYear === reqYear && lastSection === "lang" && reqSection === "logic") {
    if (elapsedMin <= 10) return { blocked: false, rule: "lang_to_logic_10m_exception" };
    if (elapsedMin < 110) {
      return {
        blocked: true,
        rule: "lang_to_logic_110m",
        retry_after_minutes: toPositiveRetry(110, elapsedMin),
        reason: "too_early"
      };
    }
  }

  return { blocked: false };
}

/* -------------------- section conversion -------------------- */
/**
 * leet_score_table_hybrid_v2.json 구조:
 * conv[section][year].raw_to[raw] => { std, pct }
 */
function lookupSectionConversion(conv, year, section, raw) {
  const y = String(year);
  const r = String(raw);
  return conv?.[section]?.[y]?.raw_to?.[r] ?? null;
}

/* -------------------- total cum-rank conversion -------------------- */
/**
 * leet_total_standard_score_cum_rank.csv 구조:
 * 1행: leet_total_standard_score_cum_rank,,
 * 2행: year,score_cut,cum_rank
 * ...
 */
function readTotalCumRankCsv(filePath) {
  const lines = readLinesUtf8Sig(filePath);
  if (lines.length === 0) return [];

  let start = 0;
  if (lines[0].startsWith("leet_total_standard_score_cum_rank")) start = 1;

  const header = (lines[start] || "")
    .split(",")
    .map((s) => s.replace(/^\uFEFF/, "").trim()); // ✅ 헤더 BOM 제거

  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((s) => s.trim());
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = cols[j] ?? "";
    rows.push(obj);
  }
  return rows; // keys: year, score_cut, cum_rank
}

/**
 * year별 점수컷(score_cut) 내림차순에서:
 * totalStd >= cut 인 첫 구간의 cum_rank를 반환 (누적석차 상한 근사)
 * - 만약 최저 cut보다도 낮으면: 최저 cut의 cum_rank(=N)를 반환(꼴찌 근사)
 */
function lookupCumRankApprox(rows, year, totalStd) {
  const y = String(year);
  const s = Number(totalStd);

  const arr = rows
    .filter((r) => String(r.year) === y)
    .map((r) => ({
      cut: Number(r.score_cut),
      cum: Number(r.cum_rank),
    }))
    .filter((x) => Number.isFinite(x.cut) && Number.isFinite(x.cum));

  if (arr.length === 0) return null;

  arr.sort((a, b) => b.cut - a.cut);

  for (const x of arr) {
    if (s >= x.cut) return { score_cut_used: x.cut, expected_rank_approx: x.cum, below_lowest_cut: false };
  }

  const lowest = arr[arr.length - 1];
  return { score_cut_used: lowest.cut, expected_rank_approx: lowest.cum, below_lowest_cut: true };
}

/** 해당 연도 N(응시자 수 근사) = cum_rank 최댓값 */
function estimateN(rows, year) {
  const y = String(year);
  const vals = rows
    .filter((r) => String(r.year) === y)
    .map((r) => Number(r.cum_rank))
    .filter(Number.isFinite);

  if (vals.length === 0) return null;
  return Math.max(...vals);
}

/* -------------------- grading core -------------------- */
function gradeOneSection({ year, section, form, answers, db, sectionConv }) {
  const pack = db?.[section]?.[String(year)];
  if (!pack) return { ok: false, error: "exam_not_found" };

  const key = form === "even" ? "even_answers" : "odd_answers";
  const correctArr = pack[key] || pack.answers || [];
  const spec = getExamSpec(year, section) || fallbackSpecFromAnswers(correctArr);
  const totalOfficial = Number(spec?.total || 0);
  const indepCount = section === "lang" ? Number(spec?.indep || 0) : 0;
  const totalPassage = Math.max(0, totalOfficial - indepCount);

  let correct = 0;
  const wrong = [];
  const input = {};

  for (const qStr of Object.keys(answers || {})) {
    const q = parseInt(qStr, 10);
    if (!Number.isFinite(q) || q <= 0) continue;
    const user = toAnswerInt(answers[qStr]);
    if (user == null) continue;
    input[q] = user;
  }

  let attemptedCount = 0;
  for (const qStr of Object.keys(input)) {
    const q = parseInt(qStr, 10);
    if (!Number.isFinite(q) || q < 1 || q > totalOfficial) continue;
    if (isIndependentQ(q, indepCount)) continue;
    if (correctArr[q] == null) continue;
    attemptedCount += 1;
  }

  if (attemptedCount <= 0) {
    return {
      ok: true,
      attempted: false,
      attempted_count: 0,
      raw: null,
      std: null,
      pct: null,
      total: totalOfficial,
      wrong: [],
      assumed_indep: indepCount,
      raw_passage: null,
      total_passage: totalPassage,
    };
  }

  for (let q = 1; q <= totalOfficial; q++) {
    if (isIndependentQ(q, indepCount)) {
      correct += 1; // 독립문항은 만점 가정
      continue;
    }

    const ans = correctArr[q];
    if (ans == null) continue;

    const user = input[q];
    if (user === ans) correct += 1;
    else wrong.push(q);
  }

  const raw = correct;
  const convHit = lookupSectionConversion(sectionConv, year, section, raw);
  const rawPassage = Math.max(0, raw - indepCount);

  return {
    ok: true,
    attempted: true,
    attempted_count: attemptedCount,
    raw,
    std: typeof convHit?.std === "number" ? convHit.std : null,
    pct: typeof convHit?.pct === "number" ? convHit.pct : null,
    total: totalOfficial,
    wrong,
    assumed_indep: indepCount,
    raw_passage: rawPassage,
    total_passage: totalPassage,
  };
}

function getSectionPack({ year, section, form, db }) {
  const pack = db?.[section]?.[String(year)] || null;
  if (!pack) return null;
  const key = form === "even" ? "even_answers" : "odd_answers";
  const correctArr = pack[key] || pack.answers || [];
  const pCorrectArr = Array.isArray(pack?.p_correct) ? pack.p_correct : [];
  const spec = getExamSpec(year, section) || fallbackSpecFromAnswers(correctArr);
  const totalOfficial = Number(spec?.total || 0);
  return { pack, correctArr, pCorrectArr, totalOfficial };
}

function buildAttemptItemRows({ attemptId, userId, year, section, form, answers, db }) {
  const sectionPack = getSectionPack({ year, section, form, db });
  if (!sectionPack) return [];

  const { correctArr, pCorrectArr, totalOfficial } = sectionPack;
  const rows = [];
  for (let q = 1; q <= totalOfficial; q += 1) {
    const myAnswer = toAnswerInt(answers?.[q] ?? answers?.[String(q)]);
    const correctAnswer = toAnswerInt(correctArr[q]);
    const isCorrect = correctAnswer == null ? null : myAnswer != null && myAnswer === correctAnswer;
    const p = Number(pCorrectArr[q]);
    const pCorrect = Number.isFinite(p) ? p : null;

    rows.push({
      attempt_id: attemptId,
      user_id: userId,
      item_no: q,
      my_answer: myAnswer,
      correct_answer: correctAnswer,
      is_correct: isCorrect,
      p_correct: pCorrect,
    });
  }
  return rows;
}

async function insertAttemptRow(admin, payload) {
  const variants = [payload];
  if (Object.prototype.hasOwnProperty.call(payload, "user_id")) {
    const { user_id, ...rest } = payload;
    variants.push(rest);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_deleted")) {
    const { is_deleted, ...rest } = payload;
    variants.push(rest);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "user_id") && Object.prototype.hasOwnProperty.call(payload, "is_deleted")) {
    const { user_id, is_deleted, ...rest } = payload;
    variants.push(rest);
  }

  let lastError = null;
  for (const row of variants) {
    const { data, error } = await admin.from("exam_attempts").insert(row).select("id").single();
    if (!error) return data?.id || null;
    lastError = error;
    if (!isColumnMissingError(error)) break;
  }

  throw lastError || new Error("exam_attempts_insert_failed");
}

function stripKeys(rows, keys) {
  return rows.map((row) => {
    const next = { ...row };
    for (const key of keys) delete next[key];
    return next;
  });
}

async function insertAttemptItems(admin, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const variants = [
    rows,
    stripKeys(rows, ["user_id"]),
    stripKeys(rows, ['p_correct']),
    stripKeys(rows, ["user_id", 'p_correct']),
  ];

  let lastError = null;
  for (const payload of variants) {
    const { error } = await admin.from("exam_attempt_items").insert(payload);
    if (!error) return;
    lastError = error;
    if (!isColumnMissingError(error)) break;
  }

  throw lastError || new Error("exam_attempt_items_insert_failed");
}

async function applyItemStats(admin, rows, year, section, form) {
  if (!admin || !Array.isArray(rows) || rows.length === 0) return;
  const yearInt = baseYearOf(year);
  const normalizedSection = normalizeSection(section);
  const normalizedForm = String(form || "").toLowerCase();
  if (!Number.isFinite(yearInt) || !normalizedSection || !(normalizedForm === "odd" || normalizedForm === "even" || normalizedForm === "na")) {
    return;
  }

  for (const row of rows) {
    const itemNo = Number(row?.item_no);
    if (!Number.isFinite(itemNo) || itemNo <= 0) continue;
    const isCorrect = row?.is_correct === true;
    const { error } = await admin.rpc("item_stats_apply", {
      p_year: yearInt,
      p_section: normalizedSection,
      p_form: normalizedForm,
      p_item_no: Math.trunc(itemNo),
      p_is_correct: isCorrect,
    });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("item_stats_apply") || msg.includes("does not exist") || msg.includes("permission")) {
        return;
      }
      throw error;
    }
  }
}

async function persistAnonAttempt(admin, { year, section, form, result }) {
  if (!admin || !result?.attempted) return;
  const payload = {
    year: String(year),
    section,
    form,
    raw_score: typeof result.raw === "number" ? result.raw : null,
    standard_score: typeof result.std === "number" ? result.std : null,
    percentile: typeof result.pct === "number" ? result.pct : null,
  };

  const variants = [
    payload,
    (() => {
      const { percentile, ...rest } = payload;
      return rest;
    })(),
  ];

  for (const row of variants) {
    const { error } = await admin.from("exam_attempts_anon").insert(row);
    if (!error) return;
    const message = String(error.message || "");
    if (
      message.includes("exam_attempts_anon") ||
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("permission")
    ) {
      return;
    }
  }
}

async function persistSectionAttempt({ admin, userId, year, section, form, answers, result, db }) {
  if (!admin || !userId) return null;
  if (!result?.attempted) return null;

  const attemptPayload = {
    user_id: userId,
    year: String(year),
    section,
    form,
    is_deleted: false,
    official_total: typeof result.total === "number" ? result.total : null,
    raw_score: typeof result.raw === "number" ? result.raw : null,
    standard_score: typeof result.std === "number" ? result.std : null,
    percentile: typeof result.pct === "number" ? result.pct : null,
    meta: {
      attempted: result.attempted === true,
      attempted_count: Number(result.attempted_count || 0),
      assumed_indep: Number(result.assumed_indep || 0),
      raw_passage: typeof result.raw_passage === "number" ? result.raw_passage : null,
      total_passage: typeof result.total_passage === "number" ? result.total_passage : null,
      wrong: Array.isArray(result.wrong) ? result.wrong : [],
    },
  };

  const attemptId = await insertAttemptRow(admin, attemptPayload);
  if (!attemptId) return null;

  const itemRows = buildAttemptItemRows({
    attemptId,
    userId,
    year,
    section,
    form,
    answers,
    db,
  });
  await insertAttemptItems(admin, itemRows);
  try {
    await applyItemStats(admin, itemRows, year, section, form);
  } catch (statsError) {
    console.warn("[grade] item_stats_apply failed:", statsError?.message || String(statsError));
  }

  try {
    await persistAnonAttempt(admin, { year, section, form, result });
  } catch (anonError) {
    console.warn("[grade] exam_attempts_anon insert failed:", anonError?.message || String(anonError));
  }
  return attemptId;
}

/* -------------------- handler -------------------- */
export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(event);
  const respond = (statusCode, body, level = "info", eventName = "grade_response") => {
    logEvent(level, eventName, {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: statusCode,
    });
    return json(statusCode, body);
  };
  try {
    if (event.httpMethod === "GET") {
      return respond(200, {
        ok: true,
        usage: {
          multi: {
            method: "POST",
            body: {
              year: 2025,
              form: "odd | even",
              lang_answers: { "1": 1, "2": 3 },
              logic_answers: { "1": 5, "2": 2 },
            },
          },
          single: {
            method: "POST",
            body: {
              year: 2025,
              section: "lang | logic",
              form: "odd | even",
              answers: { "1": 1, "2": 3 },
            },
          },
        },
      });
    }

    if (event.httpMethod !== "POST") {
      return respond(405, { ok: false, error: "method_not_allowed" }, "warn", "grade_method_not_allowed");
    }

    const body = JSON.parse(event.body || "{}");
    const year = body.year;
    const reqYear = baseYearOf(year);
    const form = body.form;
    const reqSection = deriveRequestedSection(body);

    if (!year || !form) {
      return respond(400, { ok: false, error: "invalid_request" }, "warn", "grade_invalid_request");
    }

    const canViewApprox = await canViewTotalApprox(event);

    const admin = getSupabaseAdminClient();
    const bearerToken = extractBearerToken(event);
    let authedUser = null;
    if (admin && bearerToken) {
      try {
        authedUser = await getUserFromToken(admin, bearerToken);
      } catch {
        authedUser = null;
      }
    }

    if (authedUser?.id && reqSection && Number.isFinite(reqYear)) {
      const gate = await checkGradeWindow({
        admin,
        user: authedUser,
        reqYear,
        reqSection,
      });
      if (gate.blocked) {
        return respond(429, {
          ok: false,
          blocked: true,
          reason: gate.reason || "too_early",
          rule: gate.rule || null,
          retry_after_minutes: Number(gate.retry_after_minutes || 0),
        }, "warn", "grade_window_blocked");
      }
    }

    // 공통 데이터 로드
    const dbPath = path.join(process.cwd(), "netlify", "functions", "_private", "leet_private_db.json");
    const sectionConvPath = path.join(process.cwd(), "netlify", "functions", "_private", "leet_score_table_hybrid_v2.json");
    const totalCsvPath = path.join(process.cwd(), "netlify", "functions", "_private", "leet_total_standard_score_cum_rank.csv");

    const db = readJson(dbPath);
    const sectionConv = readJson(sectionConvPath);

    const hasMultiPayload =
      typeof body.lang_answers === "object" && body.lang_answers != null &&
      typeof body.logic_answers === "object" && body.logic_answers != null;

    // --- single 호환 ---
    if (!hasMultiPayload && body.section && body.answers) {
      const section = body.section;
      const answers = body.answers;

      const r = gradeOneSection({ year, section, form, answers, db, sectionConv });
      if (!r.ok) return respond(404, { ok: false, error: r.error }, "warn", "grade_exam_not_found_single");
      const qIds = getSectionQuestionIds({ year, section, form, db });
      const stars = buildStarsForSection({ year, section, qIds });

      let attemptId = null;
      if (authedUser?.id && r.attempted) {
        try {
          attemptId = await persistSectionAttempt({
            admin,
            userId: authedUser.id,
            year,
            section,
            form,
            answers,
            result: r,
            db,
          });
        } catch (persistError) {
          console.warn("[grade] save(single) failed:", persistError?.message || persistError);
        }
      }

      return respond(200, {
        ok: true,
        year,
        section,
        form,
        attempted: r.attempted,
        attempted_count: r.attempted_count,
        correct: r.raw,
        total: r.total,
        wrong: r.wrong,
        assumed_indep: r.assumed_indep,
        raw_passage: r.raw_passage,
        total_passage: r.total_passage,
        raw_score: r.raw,
        standard_score: r.std,
        percentile: r.pct,
        stars,
        attempt_id: attemptId,
      });
    }

    // --- multi ---
    const lang_answers = body.lang_answers;
    const logic_answers = body.logic_answers;

    if (!hasMultiPayload) {
      return respond(400, { ok: false, error: "invalid_request" }, "warn", "grade_invalid_request_multi");
    }

    const lang = gradeOneSection({ year, section: "lang", form, answers: lang_answers, db, sectionConv });
    const logic = gradeOneSection({ year, section: "logic", form, answers: logic_answers, db, sectionConv });

    if (!lang.ok || !logic.ok) {
      return respond(404, { ok: false, error: "exam_not_found" }, "warn", "grade_exam_not_found_multi");
    }
    lang.stars = buildStarsForSection({
      year,
      section: "lang",
      qIds: getSectionQuestionIds({ year, section: "lang", form, db }),
    });
    logic.stars = buildStarsForSection({
      year,
      section: "logic",
      qIds: getSectionQuestionIds({ year, section: "logic", form, db }),
    });

    const bothAttempted = lang.attempted === true && logic.attempted === true;

    const total_std_sum =
      bothAttempted && typeof lang.std === "number" && typeof logic.std === "number"
        ? Number((lang.std + logic.std).toFixed(1))
        : null;

    // total cum-rank 근사
    let score_cut_used = null;
    let expected_rank_approx = null;
    let total_pct_approx = null;
    let note = null;

    if (!bothAttempted) {
      note = "한 영역만 채점됨";
    } else if (typeof total_std_sum !== "number") {
      note = "표준점수 계산 불가";
    } else if (fs.existsSync(totalCsvPath)) {
      const rows = readTotalCumRankCsv(totalCsvPath);
      const hit = lookupCumRankApprox(rows, year, total_std_sum);
      const N = estimateN(rows, year);

      if (hit && N && Number.isFinite(N) && N > 0) {
        score_cut_used = hit.score_cut_used;
        expected_rank_approx = hit.expected_rank_approx;

        // 근사 백분위(하위비율): (N - 누적석차)/N*100
        total_pct_approx = Number((((N - expected_rank_approx) / N) * 100).toFixed(1));

        if (hit.below_lowest_cut) {
          note = "below_lowest_cut: score below minimum score_cut; rank approximated as bottom (N)";
        }
      } else {
        note = "total table present but could not compute (year missing or malformed rows)";
      }
    } else {
      note = "total table missing: place leet_total_standard_score_cum_rank.csv into netlify/functions/_private";
    }

    const totalPayload = {
      std_sum: total_std_sum,
      score_cut_used,
      expected_rank_approx: null,
      total_pct_approx: null,
      note: null,
    };

    if (canViewApprox) {
      totalPayload.expected_rank_approx = expected_rank_approx;
      totalPayload.total_pct_approx = total_pct_approx;
      totalPayload.note = note;
    }

    const attemptIds = { lang: null, logic: null };
    if (authedUser?.id) {
      if (lang.attempted) {
        try {
          attemptIds.lang = await persistSectionAttempt({
            admin,
            userId: authedUser.id,
            year,
            section: "lang",
            form,
            answers: lang_answers,
            result: lang,
            db,
          });
        } catch (persistError) {
          console.warn("[grade] save(multi/lang) failed:", persistError?.message || persistError);
        }
      }
      if (logic.attempted) {
        try {
          attemptIds.logic = await persistSectionAttempt({
            admin,
            userId: authedUser.id,
            year,
            section: "logic",
            form,
            answers: logic_answers,
            result: logic,
            db,
          });
        } catch (persistError) {
          console.warn("[grade] save(multi/logic) failed:", persistError?.message || persistError);
        }
      }
    }

    const attemptId = attemptIds.lang || attemptIds.logic || null;

    return respond(200, {
      ok: true,
      year,
      form,
      lang,
      logic,
      total: totalPayload,
      attempt_id: attemptId,
      attempt_ids: attemptIds,
    });
  } catch (e) {
    logEvent("error", "grade_unhandled_error", {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: 500,
      error: String(e?.message || "unknown_error"),
    });
    return json(500, { ok: false, error: "server_error" });
  }
}

