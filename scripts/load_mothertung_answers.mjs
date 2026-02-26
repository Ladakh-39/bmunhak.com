/**
 * Usage:
 *   node scripts/load_mothertung_answers.mjs
 *
 * Env required (service role):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   MOTHERTUNG_CSV_PATH (default: ./mothertung_2026_answers.csv, fallback: ./data/mothertung_2026_answers.csv)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function resolveCsvPath() {
  const override = process.env.MOTHERTUNG_CSV_PATH;
  if (override) return path.resolve(process.cwd(), override);

  const rootCsv = path.resolve(process.cwd(), "mothertung_2026_answers.csv");
  if (fs.existsSync(rootCsv)) return rootCsv;

  const dataCsv = path.resolve(process.cwd(), "data", "mothertung_2026_answers.csv");
  if (fs.existsSync(dataCsv)) return dataCsv;

  throw new Error("CSV not found. Expected ./mothertung_2026_answers.csv or ./data/mothertung_2026_answers.csv");
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const csvPath = resolveCsvPath();
const raw = fs.readFileSync(csvPath, "utf-8");

const lines = raw.split(/\r?\n/).filter(Boolean);
const header = lines.shift();
if (!header) throw new Error("CSV header missing");

const cols = header.split(",").map((s) => s.trim());
const iSubject = cols.indexOf("subject");
const iQnum = cols.indexOf("qnum");
const iQuestion = cols.indexOf("question");
const iA = cols.indexOf("answer");
const iQ = iQnum >= 0 ? iQnum : iQuestion;
if (iSubject < 0 || iQ < 0 || iA < 0) {
  throw new Error("CSV header must include subject and (qnum or question) and answer");
}

const batch = [];
for (const line of lines) {
  const parts = line.split(",");
  const subject = String(parts[iSubject] || "").trim();
  const qnum = Number(parts[iQ]);
  const answer = Number(parts[iA]);
  if (!subject || !Number.isFinite(qnum) || !Number.isFinite(answer)) continue;
  batch.push({ year: 2026, subject, qnum, answer });
}

if (!batch.length) throw new Error("No valid rows to upsert");

const CHUNK = 1000;
for (let i = 0; i < batch.length; i += CHUNK) {
  const slice = batch.slice(i, i + CHUNK);
  const { error } = await sb
    .from("mothertung_answers")
    .upsert(slice, { onConflict: "year,subject,qnum" });
  if (error) throw error;
  console.log(`upserted ${i + slice.length}/${batch.length}`);
}

console.log(`done (${batch.length} rows from ${path.relative(process.cwd(), csvPath)})`);
