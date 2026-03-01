/**
 * Backfill missing correct_answer/p_correct in exam_attempt_items
 * for 2027 mothertung attempts.
 *
 * Usage:
 *   node scripts/backfill_mothertung_correct_answers.mjs
 *
 * Env source priority:
 *   1) process.env
 *   2) ./.env.local
 */
import fs from "node:fs";
import path from "node:path";
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
const CSV_PATH = path.join(process.cwd(), "netlify", "functions", "_private", "2027_mothertung_answers.csv");

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = value;
  }
}

function toSafeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

function toSafeFloat(value) {
  if (value == null) return NaN;
  const n = Number(String(value).replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
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
  for (const key of candidates) {
    const idx = header.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

function loadAnswerMapFromCsv() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV_NOT_FOUND: ${CSV_PATH}`);
  const text = fs.readFileSync(CSV_PATH, "utf-8").replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV_EMPTY");

  const header = parseCsvRow(lines[0]);
  const idxSection = findHeaderIndex(header, ["category", "section"]);
  const idxQ = findHeaderIndex(header, ["question_id", "item_no", "qno"]);
  const idxAnswer = findHeaderIndex(header, ["correct_answer", "answer"]);
  const idxPCorrect = findHeaderIndex(header, ["p_correct", "correct_rate", "accuracy_rate"]);
  if (idxSection < 0 || idxQ < 0 || idxAnswer < 0) throw new Error("CSV_BAD_HEADER");

  const map = new Map();
  for (const subject of SUBJECTS) map.set(subject, new Map());

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvRow(lines[i]);
    const section = String(cols[idxSection] || "").trim();
    if (!SUBJECTS.has(section)) continue;
    const q = toSafeInt(cols[idxQ]);
    const ans = toSafeInt(cols[idxAnswer]);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(ans) || ans < 1 || ans > 5) continue;
    const p = toSafeFloat(idxPCorrect >= 0 ? cols[idxPCorrect] : "");
    map.get(section).set(q, {
      answer: ans,
      p_correct: Number.isFinite(p) ? p : null,
    });
  }
  return map;
}

async function main() {
  loadLocalEnv(path.join(process.cwd(), ".env.local"));

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("MISSING_SUPABASE_ENV");

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const answerMap = loadAnswerMapFromCsv();

  const { data: attempts, error: attemptsErr } = await sb
    .from("exam_attempts")
    .select("id,section,year")
    .eq("year", 2027)
    .in("section", Array.from(SUBJECTS))
    .eq("is_deleted", false);
  if (attemptsErr) throw attemptsErr;

  const byAttempt = new Map();
  for (const row of attempts || []) {
    const id = toSafeInt(row?.id);
    const section = String(row?.section || "").trim();
    if (!Number.isFinite(id) || !SUBJECTS.has(section)) continue;
    byAttempt.set(id, section);
  }

  if (!byAttempt.size) {
    console.log("No 2027 mothertung attempts found.");
    return;
  }

  const attemptIds = Array.from(byAttempt.keys());
  const BATCH = 100;
  let scanned = 0;
  let updated = 0;

  for (let i = 0; i < attemptIds.length; i += BATCH) {
    const chunk = attemptIds.slice(i, i + BATCH);
    const { data: items, error: itemsErr } = await sb
      .from("exam_attempt_items")
      .select("attempt_id,item_no,correct_answer,p_correct")
      .in("attempt_id", chunk);
    if (itemsErr) throw itemsErr;

    const upserts = [];
    for (const it of items || []) {
      scanned += 1;
      const attemptId = toSafeInt(it?.attempt_id);
      const q = toSafeInt(it?.item_no);
      if (!Number.isFinite(attemptId) || !Number.isFinite(q)) continue;
      if (it?.correct_answer != null && it?.p_correct != null) continue;

      const section = byAttempt.get(attemptId);
      if (!section) continue;
      const sectionMap = answerMap.get(section);
      const row = sectionMap?.get(q);
      if (!row) continue;

      const patch = {
        attempt_id: attemptId,
        item_no: q,
      };
      if (it?.correct_answer == null) patch.correct_answer = row.answer;
      if (it?.p_correct == null && row.p_correct != null) patch.p_correct = row.p_correct;
      if (Object.keys(patch).length > 2) upserts.push(patch);
    }

    if (upserts.length) {
      const { error: upsertErr } = await sb
        .from("exam_attempt_items")
        .upsert(upserts, { onConflict: "attempt_id,item_no" });
      if (upsertErr) throw upsertErr;
      updated += upserts.length;
    }
  }

  console.log(`Attempts scanned: ${byAttempt.size}`);
  console.log(`Items scanned: ${scanned}`);
  console.log(`Items backfilled: ${updated}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err?.message || err);
  process.exitCode = 1;
});

