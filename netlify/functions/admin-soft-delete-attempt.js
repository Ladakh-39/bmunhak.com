import { json, requireStaff, parseJsonBody, toSafeInt } from "./_admin_common.js";

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["POST"]);
    if (!auth.ok) return auth.response;
    const { admin, actorUserId } = auth;

    const body = parseJsonBody(event);
    if (!body) return json(400, { ok: false, error: "INVALID_JSON" });

    const attemptId = toSafeInt(body.attempt_id);
    if (!Number.isFinite(attemptId) || attemptId <= 0) {
      return json(400, { ok: false, error: "INVALID_ATTEMPT_ID" });
    }

    const patch = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("exam_attempts")
      .update(patch)
      .eq("id", attemptId)
      .select("id,user_id,is_deleted,deleted_at")
      .maybeSingle();

    if (error) return json(500, { ok: false, error: "ATTEMPT_SOFT_DELETE_FAILED", detail: error.message });
    if (!data) return json(404, { ok: false, error: "ATTEMPT_NOT_FOUND" });

    return json(200, {
      ok: true,
      attempt: data,
      deleted_by: actorUserId,
    });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

