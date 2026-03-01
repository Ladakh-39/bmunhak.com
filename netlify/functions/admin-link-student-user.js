import { json, requireStaff, parseJsonBody, toSafeInt, isValidUuid } from "./_admin_common.js";

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["POST"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const body = parseJsonBody(event);
    if (!body) return json(400, { ok: false, error: "INVALID_JSON" });

    const id = toSafeInt(body.id);
    const userId = String(body.user_id || "").trim();
    if (!Number.isFinite(id) || id <= 0) return json(400, { ok: false, error: "INVALID_ID" });
    if (!isValidUuid(userId)) return json(400, { ok: false, error: "INVALID_USER_ID" });

    const existsRes = await admin.auth.admin.getUserById(userId);
    if (existsRes.error || !existsRes?.data?.user) {
      return json(400, { ok: false, error: "USER_NOT_FOUND" });
    }

    const { data: conflict, error: cError } = await admin
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .neq("id", id)
      .limit(1)
      .maybeSingle();
    if (cError) return json(500, { ok: false, error: "STUDENT_LINK_CHECK_FAILED", detail: cError.message });
    if (conflict) return json(409, { ok: false, error: "USER_ALREADY_LINKED" });

    const { data, error } = await admin
      .from("students")
      .update({ user_id: userId })
      .eq("id", id)
      .select("id,grade_level,grade_year,name,user_id,created_at")
      .maybeSingle();
    if (error) {
      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        return json(409, { ok: false, error: "USER_ALREADY_LINKED" });
      }
      return json(500, { ok: false, error: "STUDENT_LINK_FAILED", detail: error.message });
    }
    if (!data) return json(404, { ok: false, error: "STUDENT_NOT_FOUND" });

    return json(200, { ok: true, student: data });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

