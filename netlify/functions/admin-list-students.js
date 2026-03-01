import { json, requireStaff, toSafeInt, isValidGradeLevel, isValidGradeYear } from "./_admin_common.js";

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["GET"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const query = event?.queryStringParameters || {};
    const gradeLevel = String(query.grade_level || "").trim();
    const gradeYearRaw = String(query.grade_year || "").trim();
    const q = String(query.q || "").trim();
    const limitRaw = toSafeInt(query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    if (gradeLevel && !isValidGradeLevel(gradeLevel)) {
      return json(400, { ok: false, error: "INVALID_GRADE_LEVEL" });
    }
    if (gradeYearRaw && !isValidGradeYear(gradeYearRaw)) {
      return json(400, { ok: false, error: "INVALID_GRADE_YEAR" });
    }

    let dbq = admin
      .from("students")
      .select("id,grade_level,grade_year,name,user_id,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (gradeLevel) dbq = dbq.eq("grade_level", gradeLevel);
    if (gradeYearRaw) dbq = dbq.eq("grade_year", Number(gradeYearRaw));
    if (q) dbq = dbq.ilike("name", `%${q}%`);

    const { data, error } = await dbq;
    if (error) return json(500, { ok: false, error: "STUDENTS_QUERY_FAILED", detail: error.message });

    return json(200, {
      ok: true,
      students: Array.isArray(data) ? data : [],
    });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

