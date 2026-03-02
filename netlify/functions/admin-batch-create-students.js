import { json, requireAdmin, parseJsonBody } from "./_admin_common.js";

const MODES = new Set(["skip_duplicates", "error_on_duplicates"]);
const RAW_PREVIEW_LIMIT = 200;
const MAX_LINES = 500;

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateRaw(value) {
  const text = String(value || "").trim();
  if (text.length <= RAW_PREVIEW_LIMIT) return text;
  return `${text.slice(0, RAW_PREVIEW_LIMIT)}...`;
}

function normalizeGradeLevel(value) {
  const raw = normalizeSpace(value);
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (raw === "고등" || compact === "고" || compact === "고등" || compact === "고교" || compact === "고등학교") return "고등";
  if (raw === "중등" || compact === "중" || compact === "중등" || compact === "중학" || compact === "중학교") return "중등";
  return "";
}

function normalizeGradeYear(value) {
  const raw = normalizeSpace(value);
  if (!raw) return NaN;
  const match = raw.match(/\d+/);
  if (!match) return NaN;
  const year = Number(match[0]);
  if (!Number.isFinite(year) || year < 1 || year > 3) return NaN;
  return Math.trunc(year);
}

function normalizeName(value) {
  const name = normalizeSpace(value);
  if (!name || name.length > 40) return "";
  return name;
}

function parseLine(trimmedLine) {
  let parts = null;
  if (trimmedLine.includes("\t")) parts = trimmedLine.split("\t");
  else if (trimmedLine.includes(",")) parts = trimmedLine.split(",");
  else if (trimmedLine.includes("|")) parts = trimmedLine.split("|");

  if (Array.isArray(parts)) {
    if (parts.length < 3) return null;
    return {
      gradeRaw: normalizeSpace(parts[0]),
      yearRaw: normalizeSpace(parts[1]),
      nameRaw: normalizeSpace(parts.slice(2).join(" ")),
    };
  }

  const tokens = trimmedLine.split(/\s+/);
  if (tokens.length < 3) return null;
  return {
    gradeRaw: normalizeSpace(tokens[0]),
    yearRaw: normalizeSpace(tokens[1]),
    nameRaw: normalizeSpace(tokens.slice(2).join(" ")),
  };
}

function keyOf(row) {
  return `${row.grade_level}|${row.grade_year}|${row.name}`;
}

export async function handler(event) {
  try {
    const auth = await requireAdmin(event, ["POST"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const body = parseJsonBody(event);
    if (!body) return json(400, { ok: false, error: "BAD_REQUEST" });

    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return json(400, { ok: false, error: "BAD_REQUEST" });

    const mode = String(body.mode || "skip_duplicates").trim();
    if (!MODES.has(mode)) return json(400, { ok: false, error: "BAD_REQUEST" });
    const dryRun = body.dry_run === true;

    const rawLines = String(text).replace(/\r\n?/g, "\n").split("\n");
    if (rawLines.length > MAX_LINES) {
      return json(400, { ok: false, error: "TOO_MANY_LINES", max_lines: MAX_LINES });
    }
    const results = [];
    const inputSeen = new Set();
    const normalizedCandidates = [];

    const summary = {
      total_lines: rawLines.length,
      parsed: 0,
      inserted: 0,
      skipped_duplicate_db: 0,
      skipped_duplicate_input: 0,
      failed: 0,
    };

    for (let index = 0; index < rawLines.length; index += 1) {
      const lineNo = index + 1;
      const raw = rawLines[index];
      const trimmed = normalizeSpace(raw);
      if (!trimmed || trimmed.startsWith("#")) continue;

      summary.parsed += 1;
      const parsed = parseLine(trimmed);
      if (!parsed) {
        summary.failed += 1;
        results.push({
          line_no: lineNo,
          raw: truncateRaw(raw),
          status: "failed",
          reason: "MISSING_FIELDS",
        });
        continue;
      }

      const gradeLevel = normalizeGradeLevel(parsed.gradeRaw);
      if (!gradeLevel) {
        summary.failed += 1;
        results.push({
          line_no: lineNo,
          raw: truncateRaw(raw),
          status: "failed",
          reason: "INVALID_GRADE_LEVEL",
        });
        continue;
      }

      const gradeYear = normalizeGradeYear(parsed.yearRaw);
      if (!Number.isFinite(gradeYear)) {
        summary.failed += 1;
        results.push({
          line_no: lineNo,
          raw: truncateRaw(raw),
          status: "failed",
          reason: "INVALID_GRADE_YEAR",
        });
        continue;
      }

      const name = normalizeName(parsed.nameRaw);
      if (!name) {
        summary.failed += 1;
        results.push({
          line_no: lineNo,
          raw: truncateRaw(raw),
          status: "failed",
          reason: "INVALID_NAME",
        });
        continue;
      }

      const normalized = { grade_level: gradeLevel, grade_year: gradeYear, name };
      const dedupeKey = keyOf(normalized);
      if (inputSeen.has(dedupeKey)) {
        summary.skipped_duplicate_input += 1;
        results.push({
          line_no: lineNo,
          raw: truncateRaw(raw),
          normalized,
          status: "skipped",
          reason: "DUPLICATE_IN_INPUT",
        });
        continue;
      }

      inputSeen.add(dedupeKey);
      normalizedCandidates.push({
        line_no: lineNo,
        raw: truncateRaw(raw),
        normalized,
        key: dedupeKey,
      });
    }

    const existingByKey = new Set();
    if (normalizedCandidates.length) {
      const levels = [...new Set(normalizedCandidates.map((it) => it.normalized.grade_level))];
      const years = [...new Set(normalizedCandidates.map((it) => it.normalized.grade_year))];
      const names = [...new Set(normalizedCandidates.map((it) => it.normalized.name))];

      let dbq = admin.from("students").select("id,grade_level,grade_year,name");
      dbq = levels.length === 1 ? dbq.eq("grade_level", levels[0]) : dbq.in("grade_level", levels);
      dbq = years.length === 1 ? dbq.eq("grade_year", years[0]) : dbq.in("grade_year", years);
      dbq = names.length === 1 ? dbq.eq("name", names[0]) : dbq.in("name", names);

      const { data: existingRows, error: existingError } = await dbq;
      if (existingError) return json(500, { ok: false, error: "INTERNAL" });

      for (const row of existingRows || []) {
        const k = keyOf({
          grade_level: normalizeSpace(row?.grade_level),
          grade_year: Number(row?.grade_year || 0),
          name: normalizeName(row?.name),
        });
        existingByKey.add(k);
      }
    }

    const pendingInsert = [];
    for (const item of normalizedCandidates) {
      if (existingByKey.has(item.key)) {
        if (mode === "skip_duplicates") {
          summary.skipped_duplicate_db += 1;
          results.push({
            line_no: item.line_no,
            raw: item.raw,
            normalized: item.normalized,
            status: "skipped",
            reason: "DUPLICATE_IN_DB",
          });
        } else {
          summary.failed += 1;
          results.push({
            line_no: item.line_no,
            raw: item.raw,
            normalized: item.normalized,
            status: "failed",
            reason: "DUPLICATE_IN_DB",
          });
        }
        continue;
      }
      pendingInsert.push(item);
    }

    if (dryRun) {
      for (const item of pendingInsert) {
        results.push({
          line_no: item.line_no,
          raw: item.raw,
          normalized: item.normalized,
          status: "skipped",
          reason: "DRY_RUN",
        });
      }
      results.sort((a, b) => Number(a.line_no) - Number(b.line_no));
      return json(200, { ok: true, summary, results });
    }

    if (pendingInsert.length) {
      const insertRows = pendingInsert.map((it) => ({
        grade_level: it.normalized.grade_level,
        grade_year: it.normalized.grade_year,
        name: it.normalized.name,
      }));
      const { data: insertedRows, error: insertError } = await admin
        .from("students")
        .insert(insertRows)
        .select("id,grade_level,grade_year,name");

      if (insertError) {
        summary.failed += pendingInsert.length;
        for (const item of pendingInsert) {
          results.push({
            line_no: item.line_no,
            raw: item.raw,
            normalized: item.normalized,
            status: "failed",
            reason: "STUDENT_INSERT_FAILED",
          });
        }
      } else {
        const insertedMap = new Map();
        for (const row of insertedRows || []) {
          insertedMap.set(
            keyOf({
              grade_level: normalizeSpace(row?.grade_level),
              grade_year: Number(row?.grade_year || 0),
              name: normalizeName(row?.name),
            }),
            String(row?.id ?? ""),
          );
        }
        for (const item of pendingInsert) {
          const studentId = insertedMap.get(item.key) || "";
          if (studentId) {
            summary.inserted += 1;
            results.push({
              line_no: item.line_no,
              raw: item.raw,
              normalized: item.normalized,
              status: "inserted",
              student_id: studentId,
            });
          } else {
            summary.failed += 1;
            results.push({
              line_no: item.line_no,
              raw: item.raw,
              normalized: item.normalized,
              status: "failed",
              reason: "STUDENT_INSERT_FAILED",
            });
          }
        }
      }
    }

    results.sort((a, b) => Number(a.line_no) - Number(b.line_no));
    return json(200, { ok: true, summary, results });
  } catch (_error) {
    return json(500, { ok: false, error: "INTERNAL" });
  }
}
