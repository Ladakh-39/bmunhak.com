import { json, requireStaff, toSafeInt, maskEmail } from "./_admin_common.js";

function toSafeText(value) {
  return String(value || "").trim();
}

export async function handler(event) {
  try {
    const auth = await requireStaff(event, ["GET"]);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const query = event?.queryStringParameters || {};
    const q = toSafeText(query.q);
    const limitRaw = toSafeInt(query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    if (!q) return json(200, { ok: true, profiles: [] });

    const qLower = q.toLowerCase();
    const out = new Map();

    const { data: nickRows, error: nickErr } = await admin
      .from("profiles")
      .select("user_id,nickname,created_at")
      .ilike("nickname", `${q}%`)
      .order("nickname", { ascending: true })
      .limit(Math.max(limit * 3, 20));
    if (nickErr) return json(500, { ok: false, error: "PROFILE_SEARCH_FAILED", detail: nickErr.message });

    for (const row of nickRows || []) {
      const userId = toSafeText(row?.user_id);
      if (!userId) continue;
      out.set(userId, {
        user_id: userId,
        nickname: toSafeText(row?.nickname),
        email_hint: "",
        created_at: row?.created_at || null,
      });
    }

    const emailHits = [];
    const PER_PAGE = 200;
    for (let page = 1; page <= 10; page += 1) {
      const res = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      const users = Array.isArray(res?.data?.users) ? res.data.users : [];
      if (res.error) return json(500, { ok: false, error: "AUTH_USER_LIST_FAILED", detail: res.error.message });
      for (const user of users) {
        const email = toSafeText(user?.email);
        if (!email) continue;
        if (!email.toLowerCase().startsWith(qLower)) continue;
        emailHits.push(user);
      }
      if (users.length < PER_PAGE || emailHits.length >= limit * 3) break;
    }

    if (emailHits.length) {
      const emailIds = emailHits.map((u) => toSafeText(u?.id)).filter(Boolean);
      const { data: emailProfiles, error: pErr } = await admin
        .from("profiles")
        .select("user_id,nickname,created_at")
        .in("user_id", emailIds);
      if (pErr) return json(500, { ok: false, error: "PROFILE_LOOKUP_FAILED", detail: pErr.message });

      const nickMap = new Map();
      for (const p of emailProfiles || []) {
        const uid = toSafeText(p?.user_id);
        if (!uid) continue;
        nickMap.set(uid, p);
      }

      for (const user of emailHits) {
        const userId = toSafeText(user?.id);
        if (!userId) continue;
        const nickRow = nickMap.get(userId);
        const prev = out.get(userId);
        out.set(userId, {
          user_id: userId,
          nickname: toSafeText(prev?.nickname || nickRow?.nickname),
          email_hint: maskEmail(user?.email),
          created_at: prev?.created_at || nickRow?.created_at || user?.created_at || null,
        });
      }
    }

    const needEmail = Array.from(out.values())
      .filter((it) => !it.email_hint)
      .slice(0, limit);
    for (const row of needEmail) {
      const userRes = await admin.auth.admin.getUserById(row.user_id);
      const email = toSafeText(userRes?.data?.user?.email);
      if (email) row.email_hint = maskEmail(email);
    }

    const profiles = Array.from(out.values())
      .sort((a, b) => {
        const aNick = toSafeText(a.nickname);
        const bNick = toSafeText(b.nickname);
        if (aNick && bNick) return aNick.localeCompare(bNick, "ko");
        if (aNick) return -1;
        if (bNick) return 1;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      })
      .slice(0, limit);

    return json(200, { ok: true, profiles });
  } catch (error) {
    return json(500, { ok: false, error: "UNEXPECTED", detail: String(error?.message || error) });
  }
}

