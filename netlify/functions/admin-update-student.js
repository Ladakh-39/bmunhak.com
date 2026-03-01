import { json, requireStaff, parseJsonBody, toSafeInt, isValidGradeLevel, isValidGradeYear } from "./_admin_common.js";

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["POST"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const body = parseJsonBody(event);
    if (!body) return json(400, { ok: false, error: "INVALID_JSON" });

    const id = toSafeInt(body.id);
    const gradeLevel = String(body.grade_level || "").trim();
    const gradeYear = Number(body.grade_year || 0);
    const name = String(body.name || "").trim();

    if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "INVALID_ID" });
    if (!isValidGradeLevel(gradeLevel)) return json(400, { ok: false, error: "INVALID_GRADE_LEVEL" });
    if (!isValidGradeYear(gradeYear)) return json(400, { ok: false, error: "INVALID_GRADE_YEAR" });
    if (!name || name.length > 80) return json(400, { ok: false, error: "INVALID_NAME" });

    const { data, error } = await admin
      .from("students")
      .update({
        grade_level: gradeLevel,
        grade_year: gradeYear,
        name,
      })
      .eq("id", id)
      .select("id,grade_level,grade_year,name,user_id,created_at")
      .maybeSingle();

    if (error) return json(500, { ok: false, error: "STUDENT_UPDATE_FAILED", detail: error.message });
    if (!data) return json(404, { ok: false, error: "STUDENT_NOT_FOUND" });

    return json(200, { ok: true, student: data });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

