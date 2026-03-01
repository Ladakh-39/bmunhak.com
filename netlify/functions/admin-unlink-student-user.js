import { json, requireStaff, parseJsonBody, toSafeInt } from "./_admin_common.js";

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["POST"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const body = parseJsonBody(event);
    if (!body) return json(400, { ok: false, error: "INVALID_JSON" });

    const id = toSafeInt(body.id);
    if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "INVALID_ID" });

    const { data, error } = await admin
      .from("students")
      .update({ user_id: null })
      .eq("id", id)
      .select("id,grade_level,grade_year,name,user_id,created_at")
      .maybeSingle();
    if (error) return json(500, { ok: false, error: "STUDENT_UNLINK_FAILED", detail: error.message });
    if (!data) return json(404, { ok: false, error: "STUDENT_NOT_FOUND" });

    return json(200, { ok: true, student: data });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

