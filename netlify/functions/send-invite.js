// netlify/functions/send-invite.js
import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return fail(405, "METHOD_NOT_ALLOWED", "method not allowed");
    }

    const token = readHeader(event.headers, "x-admin-token");
    const expected = String(process.env.ADMIN_INVITE_TOKEN || "").trim();
    if (!expected) {
      return fail(500, "MISSING_ENV", "missing ADMIN_INVITE_TOKEN");
    }
    if (!token || token !== expected) {
      return fail(403, "FORBIDDEN", "admin token mismatch");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return fail(500, "MISSING_ENV", "missing SUPABASE env", {
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceRole: !!SERVICE_ROLE,
      });
    }

    const { email, note } = JSON.parse(event.body || "{}");
    const e = String(email || "").trim().toLowerCase();
    const n = String(note || "").trim();
    if (!e || !isEmail(e)) {
      return fail(400, "EMAIL_INVALID", "valid email is required");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const row = n ? { email: e, note: n } : { email: e };
    const { error: upsertErr } = await admin
      .from("invite_allowlist")
      .upsert(row, { onConflict: "email" });
    if (upsertErr) {
      return fail(500, "ALLOWLIST_UPSERT_FAILED", upsertErr.message || "allowlist upsert failed");
    }

    const siteUrl = String(process.env.SITE_URL || "https://bmunhak.com").replace(/\/+$/, "");
    const redirectTo = `${siteUrl}/#`;
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(e, {
      redirectTo,
    });
    if (inviteErr && isEmailExistsError(inviteErr)) {
      console.log("[send-invite] invite fallback to magic link", {
        action: "MAGIC_LINK_ATTEMPT",
        email: e,
        code: inviteErr?.code || null,
      });

      const { data: magicData, error: magicErr } = await admin.auth.signInWithOtp({
        email: e,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });

      if (magicErr) {
        const detail = slimError(magicErr);
        console.error("[send-invite] MAGIC_LINK_SEND_FAILED", {
          action: "MAGIC_LINK_SEND_FAILED",
          email: e,
          ...detail,
        });
        return fail(500, "MAGIC_LINK_SEND_FAILED", magicErr.message || "magic link send failed", detail);
      }

      const detail = {
        email: e,
        redirect_to: redirectTo,
        provider_action: "magiclink",
        reason: "email_exists",
        user: magicData?.user ? { id: magicData.user.id, email: magicData.user.email } : null,
      };
      console.log("[send-invite] action=MAGIC_LINK_SENT", detail);
      return json(200, { ok: true, action: "MAGIC_LINK_SENT", detail });
    }

    if (inviteErr) {
      const detail = slimError(inviteErr);
      console.error("[send-invite] INVITE_SEND_FAILED", {
        action: "INVITE_SEND_FAILED",
        email: e,
        ...detail,
      });
      return fail(500, "INVITE_SEND_FAILED", inviteErr.message || "invite send failed", detail);
    }

    const inviteUser = inviteData?.user || null;
    let invitedUser = inviteUser;
    if (invitedUser?.id && !invitedUser?.confirmation_sent_at) {
      const { data: latestUserData, error: latestUserErr } = await admin.auth.admin.getUserById(invitedUser.id);
      if (!latestUserErr && latestUserData?.user) invitedUser = latestUserData.user;
    }

    const inviteDetail = {
      user_id: invitedUser?.id || null,
      email: invitedUser?.email || e,
      invited_at: invitedUser?.invited_at || null,
      confirmation_sent_at: invitedUser?.confirmation_sent_at || null,
      redirect_to: redirectTo,
    };
    console.log("[send-invite] action=INVITED", inviteDetail);
    return json(200, { ok: true, action: "INVITED", detail: inviteDetail });
  } catch (e) {
    console.error(e);
    return fail(500, "SERVER_ERROR", e?.message || "server error");
  }
}

function isEmailExistsError(err) {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code.includes("email_exists") ||
    msg.includes("already been registered") ||
    msg.includes("already registered")
  );
}

function readHeader(headers = {}, key) {
  const lower = key.toLowerCase();
  const hit = Object.keys(headers || {}).find((k) => String(k).toLowerCase() === lower);
  return hit ? String(headers[hit] || "") : "";
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function slimError(err) {
  return {
    code: err?.code || null,
    message: err?.message || null,
    details: err?.details || null,
    hint: err?.hint || null,
    status: err?.status || null,
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function fail(statusCode, code, message, detail = null) {
  return json(statusCode, { ok: false, code, error: code, message, detail });
}
