import { json, requireStaff, toSafeInt, isValidUuid } from "./_admin_common.js";

function parseIncludeDeleted(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "y";
}

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["GET"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const query = event?.queryStringParameters || {};
    const studentId = toSafeInt(query.student_id);
    const userIdFromQuery = String(query.user_id || "").trim();
    const includeDeleted = parseIncludeDeleted(query.include_deleted);
    const limitRaw = toSafeInt(query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    let targetUserId = "";
    let student = null;
    if (Number.isFinite(studentId) && studentId > 0) {
      const { data, error } = await admin
        .from("students")
        .select("id,name,user_id,grade_level,grade_year")
        .eq("id", studentId)
        .maybeSingle();
      if (error) return json(500, { ok: false, error: "STUDENT_LOOKUP_FAILED", detail: error.message });
      if (!data) return json(404, { ok: false, error: "STUDENT_NOT_FOUND" });
      student = data;
      targetUserId = String(data.user_id || "").trim();
      if (!targetUserId) return json(200, { ok: true, student, attempts: [] });
    } else if (userIdFromQuery) {
      if (!isValidUuid(userIdFromQuery)) return json(400, { ok: false, error: "INVALID_USER_ID" });
      targetUserId = userIdFromQuery;
    } else {
      return json(400, { ok: false, error: "MISSING_TARGET" });
    }

    let dbq = admin
      .from("exam_attempts")
      .select("id,user_id,year,section,form,raw_score,official_total,created_at,is_deleted,deleted_at")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!includeDeleted) dbq = dbq.eq("is_deleted", false);

    const { data: attempts, error: aerr } = await dbq;
    if (aerr) return json(500, { ok: false, error: "ATTEMPTS_QUERY_FAILED", detail: aerr.message });

    return json(200, {
      ok: true,
      student,
      user_id: targetUserId,
      include_deleted: includeDeleted,
      attempts: Array.isArray(attempts) ? attempts : [],
    });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

