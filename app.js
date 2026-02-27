(function initJungdapCommunity(window) {
  "use strict";

  var SUPABASE_URL = "https://vbnbgigyfwfakpecetev.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibmJnaWd5ZndmYWtwZWNldGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNjY2ODgsImV4cCI6MjA4NzY0MjY4OH0.gkUreO2S0PSfHG8jtQH0G4wRGqraVLc2nTPOkhd1Lzk";
  var DEFAULT_KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/";
  var URL_CACHE_BUFFER_MS = 60 * 1000;
  var DEFAULT_SIGNED_URL_EXPIRES_SEC = 3600;

  var VALID_SECTIONS = new Set(["notice", "welcome", "free", "study", "review", "lang", "logic", "room"]);
  var urlCache = new Map();

  var SECTION_META = {
    notice: {
      name: "공지사항",
      shortName: "공지",
      descBullets: [
        "사이트 운영 및 서비스 업데이트를 안내합니다.",
        "공지사항은 운영 정책에 따라 관리됩니다.",
        "중요 공지는 상단 고정으로 표시될 수 있습니다."
      ]
    },
    welcome: {
      name: "가입인사",
      shortName: "가입인사",
      descBullets: [
        "새로 오신 분들과 첫 인사를 나누는 공간입니다.",
        "간단한 자기소개와 관심사를 남겨주세요.",
        "상대방을 존중하는 커뮤니티 문화를 지켜주세요."
      ]
    },
    free: {
      name: "자유게시판",
      shortName: "자유",
      descBullets: [
        "자유로운 주제로 의견을 나누는 게시판입니다.",
        "과도한 비방, 혐오, 도배성 글은 제한될 수 있습니다.",
        "게시판 성격과 무관한 광고는 삭제될 수 있습니다."
      ]
    },
    study: {
      name: "스터디 모집",
      shortName: "스터디",
      descBullets: [
        "오프라인/온라인 스터디 모집 글을 올리는 공간입니다.",
        "지역, 시간, 모집 인원 등 핵심 정보를 함께 작성해주세요.",
        "개인정보 노출에 유의하고 안전한 소통을 권장합니다."
      ]
    },
    review: {
      name: "시험후기",
      shortName: "시험후기",
      descBullets: [
        "학습 경험과 시험 후기를 공유하는 게시판입니다.",
        "문항 원문, 저작권 침해 내용은 게시를 금지합니다.",
        "수험생에게 도움이 되는 정보 위주로 작성해주세요."
      ]
    },
    lang: {
      name: "언어이해",
      shortName: "언어",
      descBullets: [
        "언어이해 문제 풀이와 학습 전략을 공유하는 공간입니다.",
        "저작권 정책상 문항 전문 게시는 제한될 수 있습니다.",
        "핵심 근거와 사고 과정을 중심으로 토론해주세요."
      ]
    },
    logic: {
      name: "추리논증",
      shortName: "추리",
      descBullets: [
        "추리논증 문제 풀이와 접근법을 논의하는 공간입니다.",
        "정답 주장만이 아니라 논증 과정을 함께 제시해주세요.",
        "상호 존중 기반의 비판적 토론을 지향합니다."
      ]
    },
    room: {
      name: "필요의 방",
      shortName: "필요",
      descBullets: [
        "스스로 방을 만들어 들어온 당신, 수험생들의 쉼터 '필요의 방'에 오신 것을 환영합니다. 여기는 일상을 나누는 자유로운 공간입니다.",
        "서로를 존중하는 말과 행동으로 편안한 분위기를 함께 만들어 주세요.",
        "잠시 쉬어가고 싶은 순간에도 부담 없이 들를 수 있는 공간입니다."
      ]
    }
  };

  function toStringSafe(value) {
    return String(value == null ? "" : value);
  }

  function escapeHtml(input) {
    return toStringSafe(input)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatYmd(ts) {
    var d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "-";
    var yy = String(d.getFullYear()).slice(2);
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return yy + "/" + mm + "/" + dd;
  }

  function parseSectionSlug(raw, fallback) {
    var base = toStringSafe(raw || fallback || "free").toLowerCase();
    var alias = {
      intro: "welcome",
      qna: "lang"
    };
    var normalized = alias[base] || base;
    return VALID_SECTIONS.has(normalized) ? normalized : (fallback || "free");
  }

  function getKakaoOpenChatUrl() {
    var fromGlobal = toStringSafe(window.__kakaoOpenChatUrl).trim();
    return fromGlobal || DEFAULT_KAKAO_OPEN_CHAT_URL;
  }

  function sanitizeFilename(name) {
    return toStringSafe(name || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
  }

  function formatFileSize(bytes) {
    var n = Number(bytes || 0);
    if (!Number.isFinite(n) || n < 1) return "0 B";
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return String(Math.trunc(n)) + " B";
  }

  async function resolveStorageUrl(bucket, path, expiresSec) {
    var safeBucket = toStringSafe(bucket).trim();
    var safePath = toStringSafe(path).trim();
    if (!safeBucket || !safePath) return "";
    var expires = Math.max(60, Number(expiresSec) || DEFAULT_SIGNED_URL_EXPIRES_SEC);
    var cacheKey = safeBucket + ":" + safePath;
    var now = Date.now();
    var cached = urlCache.get(cacheKey);
    if (cached && cached.url && Number(cached.expiresAt || 0) > now + URL_CACHE_BUFFER_MS) {
      return cached.url;
    }

    var sb = getSb();
    var url = "";
    try {
      var _a = await sb.storage.from(safeBucket).createSignedUrl(safePath, expires), data = _a.data, error = _a.error;
      if (!error && data && data.signedUrl) url = data.signedUrl;
    } catch (_b) {
      // ignore and fallback
    }

    if (!url) {
      try {
        var _c = sb.storage.from(safeBucket).getPublicUrl(safePath), pubData = _c.data;
        url = toStringSafe(pubData && pubData.publicUrl).trim();
      } catch (_d) {
        // ignore
      }
    }

    if (url) {
      urlCache.set(cacheKey, {
        url: url,
        expiresAt: now + (expires * 1000)
      });
      return url;
    }

    urlCache.delete(cacheKey);
    return "";
  }

  function resolveBoardUploadUrl(path, expiresSec) {
    return resolveStorageUrl("board-uploads", path, expiresSec);
  }

  function resolveAvatarUrl(path, expiresSec) {
    return resolveStorageUrl("avatars", path, expiresSec);
  }

  function getSb() {
    if (window.__jungdapSupabaseClient) return window.__jungdapSupabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("supabase-js 로딩 실패");
    }
    window.__jungdapSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return window.__jungdapSupabaseClient;
  }

  function isMissingColumnError(error, column) {
    var msg = toStringSafe(error && error.message).toLowerCase();
    return msg.includes(column.toLowerCase()) && (msg.includes("does not exist") || msg.includes("schema cache"));
  }

  function dedupe(arr) {
    return Array.from(new Set(arr));
  }

  function isNoticePost(row) {
    var section = toStringSafe(row && row.section_slug).toLowerCase();
    var prefix = toStringSafe(row && row.prefix).trim().toLowerCase();
    return section === "notice" || prefix === "공지" || prefix === "notice";
  }

  async function queryBoardPostsWithOptionalColumns(limit, optionalColumns) {
    var sb = getSb();
    var required = ["id", "section_slug", "title", "comment_count", "created_at"];
    var optionals = dedupe((optionalColumns || []).filter(Boolean));
    var removedOptionals = [];

    for (;;) {
      var activeOptionals = optionals.filter(function (col) { return !removedOptionals.includes(col); });
      var cols = dedupe(required.concat(activeOptionals));
      var query = sb
        .from("board_posts_active")
        .select(cols.join(","))
        .order("created_at", { ascending: false })
        .limit(limit);

      var _a = await query, data = _a.data, error = _a.error;
      if (!error) {
        return { rows: data || [], selectedColumns: cols };
      }

      var removed = false;
      for (var i = 0; i < activeOptionals.length; i += 1) {
        var col = activeOptionals[i];
        if (isMissingColumnError(error, col)) {
          removedOptionals.push(col);
          removed = true;
        }
      }
      if (!removed) throw error;
    }
  }

  async function fetchLatestPosts(limit, options) {
    var finalLimit = Math.max(1, Number(limit) || 20);
    var includeNotice = !options || options.includeNotice !== false;
    var result = await queryBoardPostsWithOptionalColumns(finalLimit * 3, ["prefix", "active_at", "author_id", "author_display"]);
    var rows = result.rows;
    if (!includeNotice) rows = rows.filter(function (row) { return !isNoticePost(row); });
    return rows.slice(0, finalLimit);
  }

  async function fetchPostsBySections(sectionSlugs, perSection, totalPrefetchLimit) {
    var targets = dedupe((sectionSlugs || []).map(function (slug) { return parseSectionSlug(slug, "free"); }));
    var eachLimit = Math.max(1, Number(perSection) || 6);
    var prefetchLimit = Math.max(eachLimit * Math.max(targets.length, 1), Number(totalPrefetchLimit) || 80);

    var result = await queryBoardPostsWithOptionalColumns(prefetchLimit, ["prefix", "active_at", "author_id", "author_display"]);
    var rows = result.rows;

    var bySection = {};
    targets.forEach(function (slug) {
      bySection[slug] = [];
    });

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      for (var j = 0; j < targets.length; j += 1) {
        var section = targets[j];
        var bucket = bySection[section];
        if (bucket.length >= eachLimit) continue;
        var isMatch = section === "notice" ? isNoticePost(row) : toStringSafe(row.section_slug) === section;
        if (isMatch) bucket.push(row);
      }
      var done = targets.every(function (slug) { return bySection[slug].length >= eachLimit; });
      if (done) break;
    }

    return { bySection: bySection, prefetchedRows: rows };
  }

  async function getNicknameMap(userIds) {
    var ids = dedupe((userIds || []).filter(Boolean));
    var map = new Map();
    if (!ids.length) return map;
    var sb = getSb();
    var _a = await sb.from("profiles").select("user_id,nickname").in("user_id", ids), data = _a.data;
    (data || []).forEach(function (row) {
      var nick = toStringSafe(row && row.nickname).trim();
      if (row && row.user_id && nick) map.set(row.user_id, nick);
    });
    return map;
  }

  function setupMobileMenu(buttonId, menuId) {
    var button = document.getElementById(buttonId || "btnMobileMenu");
    var menu = document.getElementById(menuId || "mobileMenu");
    if (!button || !menu) return;

    function bridgeClick(mobileId, topId) {
      var mobileButton = document.getElementById(mobileId);
      var topButton = document.getElementById(topId);
      if (!mobileButton || !topButton) return;
      mobileButton.addEventListener("click", function () {
        topButton.click();
        menu.classList.add("hidden");
      });
    }

    function syncMobileAuthVisibility() {
      var signupTop = document.getElementById("btnSignupTop");
      var loginTop = document.getElementById("btnLoginTop");
      var logoutTop = document.getElementById("btnLogoutTop");
      var signupMobile = document.getElementById("btnSignupMobile");
      var loginMobile = document.getElementById("btnLoginMobile");
      var logoutMobile = document.getElementById("btnLogoutMobile");

      if (signupTop && signupMobile) signupMobile.classList.toggle("hidden", signupTop.classList.contains("hidden"));
      if (loginTop && loginMobile) loginMobile.classList.toggle("hidden", loginTop.classList.contains("hidden"));
      if (logoutTop && logoutMobile) logoutMobile.classList.toggle("hidden", logoutTop.classList.contains("hidden"));
    }

    bridgeClick("btnSignupMobile", "btnSignupTop");
    bridgeClick("btnLoginMobile", "btnLoginTop");
    bridgeClick("btnLogoutMobile", "btnLogoutTop");

    ["btnSignupTop", "btnLoginTop", "btnLogoutTop"].forEach(function (id) {
      var target = document.getElementById(id);
      if (!target || typeof MutationObserver !== "function") return;
      var observer = new MutationObserver(syncMobileAuthVisibility);
      observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    });

    syncMobileAuthVisibility();
    button.addEventListener("click", function () {
      menu.classList.toggle("hidden");
    });
  }

  function bindStrictBackdropClose(overlay, onClose) {
    if (!overlay || typeof onClose !== "function") return;
    var downAttr = "data-backdrop-down";

    function setDown(value) {
      if (value) {
        overlay.setAttribute(downAttr, "1");
      } else {
        overlay.removeAttribute(downAttr);
      }
    }

    function isDown() {
      return overlay.getAttribute(downAttr) === "1";
    }

    function handleDown(event) {
      setDown(event.target === overlay);
    }

    function handleUp(event) {
      var shouldClose = isDown() && event.target === overlay;
      setDown(false);
      if (shouldClose) onClose();
    }

    overlay.addEventListener("mousedown", handleDown);
    overlay.addEventListener("mouseup", handleUp);
    overlay.addEventListener("touchstart", handleDown, { passive: true });
    overlay.addEventListener("touchend", handleUp);
    overlay.addEventListener("touchcancel", function () { setDown(false); });
    overlay.addEventListener("click", function (event) {
      if (event.target !== overlay) return;
      event.preventDefault();
      event.stopPropagation();
    });

    window.addEventListener("mouseup", function () { setDown(false); });
    window.addEventListener("touchend", function () { setDown(false); }, { passive: true });
  }

  function setupContactModal(options) {
    var config = Object.assign({
      openButtonId: "btnContactOpen",
      modalId: "contactModal",
      closeButtonId: "btnCloseContact",
      copyButtons: ["btnCopyKakaoLink", "btnCopyKakaoLink2"],
      toastId: "copyToast"
    }, options || {});

    var modal = document.getElementById(config.modalId);
    var openBtn = document.getElementById(config.openButtonId);
    var closeBtn = document.getElementById(config.closeButtonId);
    var toast = document.getElementById(config.toastId);
    if (!modal || !openBtn || !closeBtn) return;

    function showModal() {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }

    function hideModal() {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message || "복사됨";
      toast.classList.remove("hidden");
      toast.classList.add("flex");
      window.setTimeout(function () {
        toast.classList.add("hidden");
        toast.classList.remove("flex");
      }, 1500);
    }

    async function copyUrl() {
      var url = getKakaoOpenChatUrl();
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(url);
        } else {
          var input = document.createElement("input");
          input.value = url;
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          document.body.removeChild(input);
        }
        showToast("복사됨");
      } catch (_a) {
        showToast("복사 실패");
      }
    }

    openBtn.addEventListener("click", showModal);
    closeBtn.addEventListener("click", hideModal);
    modal.addEventListener("click", function (event) {
      if (event.target === modal) hideModal();
    });

    (config.copyButtons || []).forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      node.addEventListener("click", copyUrl);
    });
  }

  function classifyRecentCommentPlus(lastCommentAt, nowTs) {
    var ts = new Date(lastCommentAt).getTime();
    if (!Number.isFinite(ts)) return null;
    var now = Number.isFinite(nowTs) ? nowTs : Date.now();
    var diffMs = Math.max(0, now - ts);
    var hourMs = 60 * 60 * 1000;
    if (diffMs <= hourMs) return "red";
    if (diffMs <= 6 * hourMs) return "orange";
    if (diffMs <= 12 * hourMs) return "blue";
    return null;
  }

  function setupSecretRoomHover(options) {
    var config = Object.assign({
      elementId: "room-of-requirement",
      elementIds: null,
      hiddenColor: "#7092BE",
      hoverColor: "#FFFFFF",
      openColor: "#FFFFFF",
      requiredCount: 3,
      withinMs: 1500,
      resetMs: 1500
    }, options || {});
    config.hiddenColor = "#7092BE";
    config.hoverColor = "#7496C2";
    config.openColor = "#FFFFFF";
    config.requiredCount = 3;
    config.withinMs = 1500;

    var nodeTargets = [];
    if (Array.isArray(config.elementIds) && config.elementIds.length) {
      nodeTargets = config.elementIds.slice();
    } else if (config.elementId) {
      nodeTargets = [config.elementId];
      if (config.elementId === "room-of-requirement") {
        nodeTargets.push("room-of-requirement-mobile");
      }
    }

    function resolveNode(target) {
      if (!target) return null;
      return typeof target === "string" ? document.getElementById(target) : target;
    }

    nodeTargets.forEach(function (target) {
      var node = resolveNode(target);
      if (!node) return;
      node.classList.remove("room-secret-prehide");

      var isTouchOnly = false;
      try {
        isTouchOnly = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
      } catch (_a) {
        isTouchOnly = false;
      }

      var targetId = typeof target === "string" ? target : node.id;
      node.style.userSelect = "none";
      node.style.transition = "none";
      node.style.setProperty("color", config.hiddenColor, "important");
      node.style.setProperty("cursor", "default", "important");
      node.style.setProperty("visibility", "visible", "important");
      node.style.setProperty("pointer-events", "auto", "important");
      void node.offsetWidth;
      node.style.transition = "color 0.3s ease";

      if (isTouchOnly && targetId === "room-of-requirement-mobile") {
        node.classList.add("hidden");
        node.style.setProperty("color", config.hiddenColor, "important");
        node.style.setProperty("cursor", "default", "important");
        return;
      }
      node.classList.remove("hidden");

      function applyHiddenState(element) {
        if (!element) return;
        element.style.setProperty("color", config.hiddenColor, "important");
        element.style.setProperty("cursor", "default", "important");
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("pointer-events", "auto", "important");
      }

      function applyHoverState(element) {
        if (!element) return;
        element.style.setProperty("color", config.hoverColor, "important");
        element.style.setProperty("cursor", "default", "important");
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("pointer-events", "auto", "important");
      }

      function applyOpenState(element) {
        if (!element) return;
        element.style.setProperty("color", config.openColor, "important");
        element.style.setProperty("cursor", "pointer", "important");
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("pointer-events", "auto", "important");
        element.style.transition = "color 0.5s ease";
      }

      var hoverCount = 0;
      var firstHoverAt = 0;
      var timer = null;
      var unlocked = false;
      var windowMs = Math.max(1, Number.parseInt(String(config.withinMs || 1500), 10) || 1500);
      var requiredCount = Math.max(1, Number.parseInt(String(config.requiredCount || 3), 10) || 3);

      function clearTimer() {
        if (!timer) return;
        window.clearTimeout(timer);
        timer = null;
      }

      function resetLockedState() {
        if (unlocked) return;
        hoverCount = 0;
        firstHoverAt = 0;
        clearTimer();
        applyHiddenState(node);
      }

      function armWindow(now) {
        firstHoverAt = now;
        clearTimer();
        timer = window.setTimeout(function () {
          if (unlocked) return;
          hoverCount = 0;
          firstHoverAt = 0;
          applyHiddenState(node);
          clearTimer();
        }, windowMs);
      }

      applyHiddenState(node);
      node.addEventListener("mouseenter", function () {
        if (!unlocked) node.style.setProperty("cursor", "default", "important");
        if (unlocked) {
          applyOpenState(node);
          return;
        }
        var now = Date.now();
        if (hoverCount === 0) armWindow(now);
        hoverCount += 1;
        var elapsed = now - firstHoverAt;

        if (hoverCount >= requiredCount && elapsed <= windowMs) {
          unlocked = true;
          clearTimer();
          applyOpenState(node);
          return;
        }

        if (elapsed > windowMs) {
          resetLockedState();
          return;
        }

        applyHoverState(node);
      });
      node.addEventListener("mouseleave", function () {
        if (unlocked) {
          applyOpenState(node);
          return;
        }
        applyHiddenState(node);
      });
    });
  }

  var __authRefs = null;
  var __authBound = false;
  var __authDomReadyBound = false;
  var __pendingAuthMode = null;
  var __signupBusy = false;
  var __loginBusy = false;
  var __resetBusy = false;
  var __nicknameChecked = false;
  var __nicknameCheckedValue = null;

  function getAuthRefs() {
    if (__authRefs) return __authRefs;

    var modal = document.getElementById("authModal");
    if (!modal) {
      var wrapper = document.createElement("div");
      wrapper.innerHTML = (
        '<div id="authModal" class="fixed inset-0 hidden items-center justify-center bg-black/40 p-4 z-[80]">' +
        '  <div class="w-full max-w-md rounded-none bg-white p-6 shadow-2xl border border-slate-200">' +
        '    <div class="flex items-start justify-between gap-4">' +
        '      <div>' +
        '        <div class="text-lg font-black text-slate-900">계정</div>' +
        '        <div class="text-xs font-bold text-slate-500 mt-1">초대코드가 있어야 가입 가능</div>' +
        '      </div>' +
        '      <button id="btnCloseAuth" class="text-slate-500 font-black" type="button">✕</button>' +
        '    </div>' +
        '    <div class="mt-4 flex gap-2">' +
        '      <button id="tabLogin" class="flex-1 px-3 py-2 rounded-none font-black bg-slate-900 text-white" type="button">로그인</button>' +
        '      <button id="tabSignup" class="flex-1 px-3 py-2 rounded-none font-black bg-slate-100 text-slate-700" type="button">회원가입</button>' +
        '    </div>' +
        '    <form id="loginForm" class="mt-4 grid gap-3">' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">이메일</label>' +
        '        <input id="loginEmail" type="email" class="w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" autocomplete="email" />' +
        '      </div>' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">비밀번호</label>' +
        '        <input id="loginPassword" type="password" class="w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" autocomplete="current-password" />' +
        '      </div>' +
        '      <button id="btnDoLogin" type="submit" class="mt-2 px-4 py-3 rounded-none font-black bg-slate-900 text-white hover:bg-black">로그인</button>' +
        '      <button id="btnResetPassword" type="button" class="px-4 py-3 rounded-none font-black bg-slate-100 text-slate-700 hover:bg-slate-200">비밀번호 재설정</button>' +
        '      <div id="loginMsg" class="text-xs font-bold text-slate-500"></div>' +
        '    </form>' +
        '    <form id="signupForm" class="mt-4 grid gap-3 hidden">' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">이메일 (ID)</label>' +
        '        <input id="signupEmail" type="email" class="w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" autocomplete="email" />' +
        '      </div>' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">초대코드</label>' +
        '        <input id="inviteCode" type="text" class="w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" placeholder="가입 코드를 입력하세요" autocomplete="off" />' +
        '        <div id="inviteHint" class="text-[11px] font-bold text-slate-500 mt-1"></div>' +
        '      </div>' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">비밀번호 만들기</label>' +
        '        <input id="signupPassword" type="password" class="w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" autocomplete="new-password" disabled />' +
        '      </div>' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">비밀번호 확인</label>' +
        '        <input id="signupPassword2" type="password" class="w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" autocomplete="new-password" disabled />' +
        '        <div id="pwHint" class="text-[11px] font-bold text-slate-500 mt-1"></div>' +
        '      </div>' +
        '      <div>' +
        '        <label class="block text-xs font-black text-slate-400 mb-1 ml-1">닉네임</label>' +
        '        <div class="flex gap-2">' +
        '          <input id="signupNickname" type="text" class="flex-1 w-full p-4 text-base font-black border-2 border-slate-200 rounded-none bg-slate-50 outline-none" placeholder="2~12자 (한/영/숫자/_/공백)" autocomplete="off" />' +
        '          <button id="btnCheckNickname" type="button" class="px-4 py-3 rounded-none font-black bg-slate-900 text-white hover:bg-black">중복확인</button>' +
        '        </div>' +
        '        <div id="nickHint" class="text-[11px] font-bold text-slate-500 mt-1"></div>' +
        '      </div>' +
        '      <button id="btnDoSignup" type="submit" class="mt-2 px-4 py-3 rounded-none font-black bg-slate-900 text-white hover:bg-black" disabled>회원가입</button>' +
        '      <div id="signupMsg" class="text-xs font-bold text-slate-500"></div>' +
        '    </form>' +
        '  </div>' +
        '</div>' +
        '<div id="nickDupModal" class="fixed inset-0 hidden items-center justify-center bg-black/40 p-4 z-[90]">' +
        '  <div class="w-full max-w-sm rounded-none bg-white p-6 shadow-2xl border border-slate-200">' +
        '    <div id="nickDupText" class="text-sm font-black text-slate-800">이미 사용 중인 닉네임입니다.</div>' +
        '    <button id="btnNickDupOk" type="button" class="mt-4 w-full px-4 py-3 rounded-none font-black bg-slate-900 text-white hover:bg-black">OK</button>' +
        '  </div>' +
        '</div>'
      );
      while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
      modal = document.getElementById("authModal");
    }

    __authRefs = {
      authModal: modal,
      btnCloseAuth: document.getElementById("btnCloseAuth"),
      tabLogin: document.getElementById("tabLogin"),
      tabSignup: document.getElementById("tabSignup"),
      loginForm: document.getElementById("loginForm"),
      signupForm: document.getElementById("signupForm"),
      loginEmail: document.getElementById("loginEmail"),
      loginPassword: document.getElementById("loginPassword"),
      btnDoLogin: document.getElementById("btnDoLogin"),
      btnResetPassword: document.getElementById("btnResetPassword"),
      loginMsg: document.getElementById("loginMsg"),
      signupEmail: document.getElementById("signupEmail"),
      inviteCode: document.getElementById("inviteCode"),
      inviteHint: document.getElementById("inviteHint"),
      signupNickname: document.getElementById("signupNickname"),
      btnCheckNickname: document.getElementById("btnCheckNickname"),
      nickHint: document.getElementById("nickHint"),
      signupPassword: document.getElementById("signupPassword"),
      signupPassword2: document.getElementById("signupPassword2"),
      pwHint: document.getElementById("pwHint"),
      btnDoSignup: document.getElementById("btnDoSignup"),
      signupMsg: document.getElementById("signupMsg"),
      nickDupModal: document.getElementById("nickDupModal"),
      nickDupText: document.getElementById("nickDupText"),
      btnNickDupOk: document.getElementById("btnNickDupOk")
    };
    return __authRefs;
  }

  function authMapLoginError(error) {
    var msg = toStringSafe(error && (error.message || error.error_description)).toLowerCase();
    if (msg.includes("invalid login credentials")) return "이메일/비밀번호가 올바르지 않습니다.";
    if (msg.includes("email not confirmed")) return "이메일 인증이 필요합니다.";
    if (msg.includes("anonymous sign-ins are disabled")) return "로그인 기능을 사용할 수 없습니다.";
    return "로그인에 실패했습니다. 잠시 후 다시 시도하세요.";
  }

  function authSignupErrorMessage(payload) {
    var code = toStringSafe(payload && (payload.code || payload.error)).toLowerCase();
    if (code === "email_exists") return "이미 가입된 이메일입니다. 로그인하세요.";
    if (code === "nickname_exists") return "이미 사용 중인 닉네임입니다.";
    if (code === "bad_invite_code" || code === "invite_invalid") return "초대코드가 유효하지 않습니다.";
    if (code === "email_not_allowed") return "초대받은 이메일만 가입 가능합니다.";
    if (code === "invite_code_required") return "초대코드를 입력하세요.";
    if (code === "weak_password") return "비밀번호가 정책에 맞지 않습니다.";
    return toStringSafe(payload && payload.message).trim() || "회원가입에 실패했습니다. 잠시 후 다시 시도하세요.";
  }

  async function parseStandardJsonResponse(res) {
    var contentType = toStringSafe(res && res.headers && res.headers.get && res.headers.get("content-type")).toLowerCase();
    if (!contentType.includes("application/json")) return { ok: false, payload: null };
    try {
      var payload = await res.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, payload: null };
      if (typeof payload.ok !== "boolean") return { ok: false, payload: null };
      if (!toStringSafe(payload.code).trim()) return { ok: false, payload: null };
      if (!toStringSafe(payload.message).trim()) return { ok: false, payload: null };
      return { ok: true, payload: payload };
    } catch (_a) {
      return { ok: false, payload: null };
    }
  }

  function authValidateNickname(raw) {
    var nick = toStringSafe(raw);
    var trimmed = nick.trim();
    if (trimmed.length < 2 || trimmed.length > 12) return { ok: false, msg: "닉네임은 2~12자" };
    if (trimmed !== nick) return { ok: false, msg: "앞/뒤 공백은 불가" };
    if (/  +/.test(trimmed)) return { ok: false, msg: "공백 연속 2번 불가" };
    if (!/^[A-Za-z0-9_가-힣 ]+$/.test(trimmed)) return { ok: false, msg: "한글/영문/숫자/_/공백만 가능" };
    return { ok: true, value: trimmed };
  }

  function authValidatePw(pw) {
    var allowed = /^[0-9A-Za-z!@#$%^&*()_+\[\]{}><:;]{10,64}$/;
    if (!allowed.test(pw)) return { ok: false, msg: "10~64자 / 허용 문자만 가능" };
    if (!/[a-z]/.test(pw)) return { ok: false, msg: "영문 소문자 1개 이상 필요" };
    if (!/[A-Z]/.test(pw)) return { ok: false, msg: "영문 대문자 1개 이상 필요" };
    if (!/[0-9]/.test(pw)) return { ok: false, msg: "숫자 1개 이상 필요" };
    if (!/[!@#$%^&*()_+\[\]{}><:;]/.test(pw)) return { ok: false, msg: "특수문자 1개 이상 필요" };
    return { ok: true, msg: "" };
  }

  async function authIsNicknameAvailable(sb, nickname) {
    var _a = await sb.from("profiles").select("user_id").eq("nickname", nickname).limit(1), data = _a.data, error = _a.error;
    if (error) throw error;
    return (data || []).length === 0;
  }

  function setAuthTab(which) {
    var refs = getAuthRefs();
    if (!refs || !refs.tabLogin || !refs.tabSignup || !refs.loginForm || !refs.signupForm) return;
    if (which === "signup") {
      refs.tabSignup.classList.remove("bg-slate-100", "text-slate-700");
      refs.tabSignup.classList.add("bg-slate-900", "text-white");
      refs.tabLogin.classList.add("bg-slate-100", "text-slate-700");
      refs.tabLogin.classList.remove("bg-slate-900", "text-white");
      refs.signupForm.classList.remove("hidden");
      refs.loginForm.classList.add("hidden");
      window.setTimeout(function () { refs.signupEmail && refs.signupEmail.focus(); }, 0);
      return;
    }
    refs.tabLogin.classList.remove("bg-slate-100", "text-slate-700");
    refs.tabLogin.classList.add("bg-slate-900", "text-white");
    refs.tabSignup.classList.add("bg-slate-100", "text-slate-700");
    refs.tabSignup.classList.remove("bg-slate-900", "text-white");
    refs.loginForm.classList.remove("hidden");
    refs.signupForm.classList.add("hidden");
    window.setTimeout(function () { refs.loginEmail && refs.loginEmail.focus(); }, 0);
  }

  function openAuth(mode) {
    if (!document.body) {
      __pendingAuthMode = mode === "signup" ? "signup" : "login";
      if (!__authDomReadyBound) {
        __authDomReadyBound = true;
        document.addEventListener("DOMContentLoaded", function () {
          setupAuthModal();
          if (__pendingAuthMode) {
            var pending = __pendingAuthMode;
            __pendingAuthMode = null;
            openAuth(pending);
          }
        }, { once: true });
      }
      return;
    }
    setupAuthModal();
    var refs = getAuthRefs();
    if (!refs || !refs.authModal) return;
    refs.authModal.classList.remove("hidden");
    refs.authModal.classList.add("flex");
    setAuthTab(mode === "signup" ? "signup" : "login");
    if (refs.loginMsg) refs.loginMsg.textContent = "";
    if (refs.signupMsg) refs.signupMsg.textContent = "";
    if (refs.nickHint) refs.nickHint.textContent = "";
    if (refs.inviteHint) refs.inviteHint.textContent = "";
    if (refs.pwHint) refs.pwHint.textContent = "";
    __nicknameChecked = false;
    __nicknameCheckedValue = null;
  }

  function closeAuth() {
    var refs = getAuthRefs();
    if (!refs || !refs.authModal) return;
    refs.authModal.classList.add("hidden");
    refs.authModal.classList.remove("flex");
  }

  function clearSupabaseLocalSessionArtifacts() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i);
        if (k && k.startsWith("sb-")) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (_a) {
      // ignore
    }
    try {
      var cKeys = [];
      for (var j = 0; j < sessionStorage.length; j += 1) {
        var k2 = sessionStorage.key(j);
        if (k2 && k2.startsWith("sb-")) cKeys.push(k2);
      }
      cKeys.forEach(function (k3) { sessionStorage.removeItem(k3); });
    } catch (_b) {
      // ignore
    }
  }

  async function hardSignOut(sbMaybe) {
    var sb = sbMaybe || getSb();
    try {
      await sb.auth.signOut({ scope: "global" });
    } catch (_a) {
      try { await sb.auth.signOut(); } catch (_b) { /* ignore */ }
    } finally {
      clearSupabaseLocalSessionArtifacts();
      try {
        window.dispatchEvent(new CustomEvent("jungdap:auth-changed", { detail: { signedIn: false } }));
      } catch (_c) {
        // ignore
      }
    }
  }

  function setupAuthModal() {
    if (!document.body) {
      if (!__authDomReadyBound) {
        __authDomReadyBound = true;
        document.addEventListener("DOMContentLoaded", setupAuthModal, { once: true });
      }
      return;
    }
    var refs = getAuthRefs();
    if (!refs || !refs.authModal) return;
    if (toStringSafe(refs.authModal.getAttribute("data-auth-local")).toLowerCase() === "true") return;
    var sb = getSb();

    function updateSignupGate() {
      if (!refs.signupPassword || !refs.signupPassword2 || !refs.inviteCode) return;
      var code = toStringSafe(refs.inviteCode.value).trim();
      var canOpen = code.length > 0;
      refs.signupPassword.disabled = !canOpen;
      refs.signupPassword2.disabled = !canOpen;
      if (!canOpen && refs.pwHint) refs.pwHint.textContent = "";
      if (refs.inviteHint) refs.inviteHint.textContent = canOpen ? "입력 확인됨" : "가입 코드를 입력하면 비밀번호 설정이 열립니다.";
    }

    function updateSignupButtonState() {
      if (!refs.btnDoSignup || !refs.signupPassword || !refs.signupPassword2 || !refs.pwHint) return;
      if (__signupBusy) return;
      var pw1 = toStringSafe(refs.signupPassword.value);
      var pw2 = toStringSafe(refs.signupPassword2.value);
      var v = authValidatePw(pw1);
      if (!v.ok) {
        refs.pwHint.textContent = v.msg;
        refs.btnDoSignup.disabled = true;
        return;
      }
      if (!pw2) {
        refs.pwHint.textContent = "";
        refs.btnDoSignup.disabled = true;
        return;
      }
      if (pw1 !== pw2) {
        refs.pwHint.textContent = "비밀번호가 서로 다름";
        refs.btnDoSignup.disabled = true;
        return;
      }
      refs.pwHint.textContent = "OK";
      refs.btnDoSignup.disabled = false;
    }

    function setSignupBusy(loading) {
      __signupBusy = loading;
      if (!refs.btnDoSignup) return;
      if (loading) {
        refs.btnDoSignup.disabled = true;
        refs.btnDoSignup.textContent = "가입 처리 중…";
      } else {
        refs.btnDoSignup.textContent = "회원가입";
        updateSignupButtonState();
      }
    }

    function setLoginBusy(loading) {
      __loginBusy = loading;
      if (!refs.btnDoLogin) return;
      refs.btnDoLogin.disabled = loading;
      refs.btnDoLogin.textContent = loading ? "로그인 중…" : "로그인";
    }

    function setResetBusy(loading) {
      __resetBusy = loading;
      if (!refs.btnResetPassword) return;
      refs.btnResetPassword.disabled = loading;
    }

    async function checkNicknameAvailability(fromEnter) {
      if (!refs.signupNickname || !refs.nickHint) return false;
      var nickInfo = authValidateNickname(refs.signupNickname.value);
      if (!nickInfo.ok) {
        refs.nickHint.textContent = nickInfo.msg;
        __nicknameChecked = false;
        __nicknameCheckedValue = null;
        return false;
      }
      refs.nickHint.textContent = "확인 중…";
      try {
        var ok = await authIsNicknameAvailable(sb, nickInfo.value);
        if (!ok) {
          refs.nickHint.textContent = "이미 사용 중인 닉네임입니다.";
          __nicknameChecked = false;
          __nicknameCheckedValue = null;
          if (fromEnter && refs.nickDupModal && refs.nickDupText) {
            refs.nickDupText.textContent = "이미 사용중인 닉네임입니다.";
            refs.nickDupModal.classList.remove("hidden");
            refs.nickDupModal.classList.add("flex");
          }
          return false;
        }
        refs.nickHint.textContent = "사용 가능한 닉네임입니다.";
        __nicknameChecked = true;
        __nicknameCheckedValue = nickInfo.value;
        return true;
      } catch (_a) {
        refs.nickHint.textContent = "중복확인 실패(잠시 후 다시 시도)";
        __nicknameChecked = false;
        __nicknameCheckedValue = null;
        return false;
      }
    }

    async function doLogin() {
      if (__loginBusy) return;
      setLoginBusy(true);
      if (refs.loginMsg) refs.loginMsg.textContent = "";
      try {
        var email = toStringSafe(refs.loginEmail && refs.loginEmail.value).trim();
        var password = toStringSafe(refs.loginPassword && refs.loginPassword.value);
        if (!email || !password) {
          if (refs.loginMsg) refs.loginMsg.textContent = "이메일/비밀번호를 입력하세요.";
          return;
        }
        var _a = await sb.auth.signInWithPassword({ email: email, password: password }), error = _a.error;
        if (error) {
          if (refs.loginMsg) refs.loginMsg.textContent = authMapLoginError(error);
          return;
        }
        closeAuth();
      } catch (_b) {
        if (refs.loginMsg) refs.loginMsg.textContent = "로그인 중 오류가 발생했습니다.";
      } finally {
        setLoginBusy(false);
      }
    }

    async function doSignup() {
      if (__signupBusy) return;
      setSignupBusy(true);
      if (refs.signupMsg) refs.signupMsg.textContent = "";
      try {
        var email = toStringSafe(refs.signupEmail && refs.signupEmail.value).trim().toLowerCase();
        var inviteCode = toStringSafe(refs.inviteCode && refs.inviteCode.value).trim();
        var pw1 = toStringSafe(refs.signupPassword && refs.signupPassword.value);
        var pw2 = toStringSafe(refs.signupPassword2 && refs.signupPassword2.value);
        var nickInfo = authValidateNickname(refs.signupNickname && refs.signupNickname.value);
        if (!email) {
          if (refs.signupMsg) refs.signupMsg.textContent = "이메일을 입력하세요.";
          return;
        }
        if (!inviteCode) {
          if (refs.signupMsg) refs.signupMsg.textContent = "초대코드를 입력하세요.";
          return;
        }
        if (!nickInfo.ok) {
          if (refs.signupMsg) refs.signupMsg.textContent = nickInfo.msg;
          return;
        }
        if (!__nicknameChecked || __nicknameCheckedValue !== nickInfo.value) {
          if (refs.signupMsg) refs.signupMsg.textContent = "닉네임 중복확인을 먼저 해주세요.";
          return;
        }
        var nowOk = await authIsNicknameAvailable(sb, nickInfo.value);
        if (!nowOk) {
          if (refs.signupMsg) refs.signupMsg.textContent = "이미 사용 중인 닉네임입니다.";
          __nicknameChecked = false;
          __nicknameCheckedValue = null;
          return;
        }
        var pwCheck = authValidatePw(pw1);
        if (!pwCheck.ok) {
          if (refs.signupMsg) refs.signupMsg.textContent = pwCheck.msg;
          return;
        }
        if (pw1 !== pw2) {
          if (refs.signupMsg) refs.signupMsg.textContent = "비밀번호가 서로 다름";
          return;
        }
        if (refs.signupMsg) refs.signupMsg.textContent = "가입 생성 중…";
        var res = await fetch("/.netlify/functions/signup-allowlist", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            email: email,
            password: pw1,
            invite_code: inviteCode,
            nickname: nickInfo.value
          })
        });
        var parsed = await parseStandardJsonResponse(res);
        if (!parsed.ok) {
          if (refs.signupMsg) refs.signupMsg.textContent = "회원가입 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
          return;
        }
        var payload = parsed.payload;
        if (!payload.ok) {
          if (refs.signupMsg) refs.signupMsg.textContent = authSignupErrorMessage(payload);
          return;
        }
        if (payload.code === "SIGNUP_CREATED") {
          if (refs.signupMsg) refs.signupMsg.textContent = "인증메일을 발송했습니다. 메일 인증 후 로그인해 주세요.";
          setAuthTab("login");
          if (refs.loginEmail) refs.loginEmail.value = email;
          return;
        }
        if (payload.code === "SIGNUP_CREATED_MAIL_FAILED") {
          if (refs.signupMsg) refs.signupMsg.textContent = payload.message || "회원가입이 완료되었지만 인증메일 발송에 실패했습니다.";
          return;
        }
        if (refs.signupMsg) refs.signupMsg.textContent = payload.message || "회원가입이 완료되었습니다.";
      } catch (_c) {
        if (refs.signupMsg) refs.signupMsg.textContent = "회원가입 중 오류가 발생했습니다.";
      } finally {
        setSignupBusy(false);
      }
    }

    if (!__authBound) {
      __authBound = true;

      refs.btnCloseAuth && refs.btnCloseAuth.addEventListener("click", closeAuth);
      bindStrictBackdropClose(refs.authModal, closeAuth);
      refs.tabLogin && refs.tabLogin.addEventListener("click", function () { setAuthTab("login"); });
      refs.tabSignup && refs.tabSignup.addEventListener("click", function () { setAuthTab("signup"); });

      refs.loginForm && refs.loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        void doLogin();
      });
      refs.btnDoLogin && refs.btnDoLogin.addEventListener("click", function (event) {
        event.preventDefault();
        void doLogin();
      });

      refs.signupForm && refs.signupForm.addEventListener("submit", function (event) {
        event.preventDefault();
        void doSignup();
      });
      refs.btnDoSignup && refs.btnDoSignup.addEventListener("click", function (event) {
        event.preventDefault();
        void doSignup();
      });

      refs.btnResetPassword && refs.btnResetPassword.addEventListener("click", async function () {
        if (__resetBusy) return;
        setResetBusy(true);
        if (refs.loginMsg) refs.loginMsg.textContent = "";
        try {
          var email = toStringSafe(refs.loginEmail && refs.loginEmail.value).trim().toLowerCase();
          if (!email) {
            if (refs.loginMsg) refs.loginMsg.textContent = "비밀번호 재설정용 이메일을 입력하세요.";
            return;
          }
          var redirectTo = location.origin + "/#";
          var _a = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo }), error = _a.error;
          if (error) {
            if (refs.loginMsg) refs.loginMsg.textContent = authMapLoginError(error);
            return;
          }
          if (refs.loginMsg) refs.loginMsg.textContent = "비밀번호 재설정 메일을 보냈습니다.";
        } catch (_b) {
          if (refs.loginMsg) refs.loginMsg.textContent = "재설정 메일 전송 중 오류가 발생했습니다.";
        } finally {
          setResetBusy(false);
        }
      });

      refs.inviteCode && refs.inviteCode.addEventListener("input", function () {
        updateSignupGate();
      });
      refs.signupPassword && refs.signupPassword.addEventListener("input", function () {
        updateSignupButtonState();
      });
      refs.signupPassword2 && refs.signupPassword2.addEventListener("input", function () {
        updateSignupButtonState();
      });
      refs.signupNickname && refs.signupNickname.addEventListener("input", function () {
        __nicknameChecked = false;
        __nicknameCheckedValue = null;
        if (refs.nickHint) refs.nickHint.textContent = "";
      });
      refs.btnCheckNickname && refs.btnCheckNickname.addEventListener("click", async function () {
        await checkNicknameAvailability(false);
      });
      refs.signupNickname && refs.signupNickname.addEventListener("keydown", async function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        await checkNicknameAvailability(true);
      });
      refs.btnNickDupOk && refs.btnNickDupOk.addEventListener("click", function () {
        if (!refs.nickDupModal) return;
        refs.nickDupModal.classList.add("hidden");
        refs.nickDupModal.classList.remove("flex");
        refs.signupNickname && refs.signupNickname.focus();
      });

      sb.auth.onAuthStateChange(function (event) {
        if (event === "SIGNED_OUT") {
          var modalOpen = refs.authModal && !refs.authModal.classList.contains("hidden");
          var signupOpen = refs.signupForm && !refs.signupForm.classList.contains("hidden");
          if (modalOpen && (signupOpen || __signupBusy)) return;
          closeAuth();
          return;
        }
        if (event === "SIGNED_IN") closeAuth();
      });
    }

    updateSignupGate();
    updateSignupButtonState();
  }

  var __bmAuthMode = "login";
  var __bmAuthInitDone = false;
  var __bmAuthStateBound = false;
  var __bmAuthBusy = false;
  var __bmNicknameChecked = false;
  var __bmNicknameCheckedLower = "";
  var __bmHeaderUiToken = 0;

  function bmById(id) {
    return document.getElementById(id);
  }

  function bmPasswordHintText() {
    return "비밀번호 8~64자 / 영문 대문자+소문자+숫자 필수 / 특수문자 !@#$%^&*()_+=;:[]{} 사용 가능";
  }

  function bmNicknameHintText() {
    return "닉네임 2~12자 (한/영/숫자/공백/_/-)";
  }

  function bmSetAuthError(message) {
    var node = bmById("authError");
    if (!node) return;
    var msg = toStringSafe(message).trim();
    if (!msg) {
      node.classList.add("hidden");
      node.textContent = "";
      return;
    }
    node.textContent = msg;
    node.classList.remove("hidden");
  }

  function bmSetNicknameStatus(message, isOk) {
    var node = bmById("nicknameStatus");
    if (!node) return;
    node.textContent = toStringSafe(message).trim();
    node.classList.remove("text-slate-500", "text-red-600", "text-green-700");
    if (isOk === true) node.classList.add("text-green-700");
    else if (isOk === false) node.classList.add("text-red-600");
    else node.classList.add("text-slate-500");
  }

  function bmResetNicknameCheck() {
    __bmNicknameChecked = false;
    __bmNicknameCheckedLower = "";
    bmSetNicknameStatus(bmNicknameHintText(), null);
  }

  function bmNormalizeNickname(raw) {
    return toStringSafe(raw).trim();
  }

  function bmValidateNickname(raw) {
    var nick = bmNormalizeNickname(raw);
    if (nick.length < 2 || nick.length > 12) return { ok: false, msg: bmNicknameHintText(), value: "" };
    if (!/^[0-9A-Za-z가-힣 _-]{2,12}$/.test(nick)) return { ok: false, msg: bmNicknameHintText(), value: "" };
    return { ok: true, msg: "", value: nick };
  }

  function bmValidatePassword(pw) {
    var password = toStringSafe(pw);
    if (password.length < 8 || password.length > 64) return { ok: false, msg: bmPasswordHintText() };
    if (!/^[A-Za-z0-9!@#$%^&*()_+=;:\[\]{}]+$/.test(password)) return { ok: false, msg: bmPasswordHintText() };
    if (!/[a-z]/.test(password)) return { ok: false, msg: bmPasswordHintText() };
    if (!/[A-Z]/.test(password)) return { ok: false, msg: bmPasswordHintText() };
    if (!/[0-9]/.test(password)) return { ok: false, msg: bmPasswordHintText() };
    return { ok: true, msg: "" };
  }

  function bmSetAuthBusy(loading) {
    __bmAuthBusy = Boolean(loading);
    var submit = bmById("authSubmitBtn");
    var cancel = bmById("authCancelBtn");
    var checkBtn = bmById("checkNicknameBtn");
    if (submit) {
      submit.disabled = __bmAuthBusy;
      submit.textContent = __bmAuthBusy ? "처리 중..." : (__bmAuthMode === "signup" ? "회원가입" : "로그인");
    }
    if (cancel) cancel.disabled = __bmAuthBusy;
    if (checkBtn) checkBtn.disabled = __bmAuthBusy;
  }

  function bmEnsureAuthModal() {
    if (!document.body) return;
    if (bmById("authModalOverlay")) return;

    var wrap = document.createElement("div");
    wrap.innerHTML = (
      '<div id="authModalOverlay" class="fixed inset-0 hidden items-center justify-center bg-black/50 z-[100]">' +
      '  <div class="w-[92%] max-w-[460px] bg-white border border-slate-300 shadow-xl">' +
      '    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-300 bg-slate-100">' +
      '      <div class="text-sm font-black text-slate-800">계정</div>' +
      '      <button id="authModalClose" class="px-2 py-1 text-xl font-black text-slate-600 hover:text-black" aria-label="close" type="button">×</button>' +
      '    </div>' +
      '    <div class="px-4 pt-4">' +
      '      <div class="flex gap-2">' +
      '        <button id="authTabLogin" class="flex-1 border border-slate-300 bg-slate-900 text-white py-2 text-sm font-black" type="button">로그인</button>' +
      '        <button id="authTabSignup" class="flex-1 border border-slate-300 bg-white text-slate-900 py-2 text-sm font-black hover:bg-slate-50" type="button">회원가입</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="px-4 py-4">' +
      '      <label class="block text-xs font-black text-slate-600 mb-1">이메일</label>' +
      '      <input id="authEmail" type="email" autocomplete="email" class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold" placeholder="email@example.com" />' +
      '      <div class="h-3"></div>' +
      '      <label class="block text-xs font-black text-slate-600 mb-1">비밀번호</label>' +
      '      <input id="authPassword" type="password" autocomplete="current-password" class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold" placeholder="********" />' +
      '      <div id="authSignupOnly" class="hidden">' +
      '        <div class="h-3"></div>' +
      '        <label class="block text-xs font-black text-slate-600 mb-1">비밀번호 확인</label>' +
      '        <input id="authPasswordConfirm" type="password" autocomplete="new-password" class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold" placeholder="********" />' +
      '        <div id="passwordPolicyHint" class="mt-2 text-[11px] font-bold text-slate-500">비밀번호 8~64자 / 영문 대문자+소문자+숫자 필수 / 특수문자 !@#$%^&*()_+=;:[]{} 사용 가능</div>' +
      '        <div class="h-3"></div>' +
      '        <label class="block text-xs font-black text-slate-600 mb-1">닉네임</label>' +
      '        <div class="flex gap-2">' +
      '          <input id="authNickname" type="text" maxlength="12" class="flex-1 border border-slate-300 px-3 py-2 text-sm font-semibold" placeholder="닉네임 입력" />' +
      '          <button id="checkNicknameBtn" type="button" class="border border-slate-300 bg-white px-3 py-2 text-xs font-black hover:bg-slate-50">중복확인</button>' +
      '        </div>' +
      '        <div id="nicknameStatus" class="mt-2 text-[11px] font-bold text-slate-500">닉네임 2~12자 (한/영/숫자/공백/_/-)</div>' +
      '      </div>' +
      '      <div id="authHint" class="mt-2 text-[11px] font-bold text-slate-500">로그인 정보를 입력하세요.</div>' +
      '      <div id="authError" class="mt-2 hidden text-[11px] font-black text-red-600"></div>' +
      '      <div class="mt-4 flex gap-2">' +
      '        <button id="authSubmitBtn" class="flex-1 border border-slate-300 bg-slate-900 text-white py-2 text-sm font-black hover:bg-black" type="button">로그인</button>' +
      '        <button id="authCancelBtn" class="flex-1 border border-slate-300 bg-white py-2 text-sm font-black hover:bg-slate-50" type="button">취소</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    );
    if (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

    var closeNode = bmById("authModalClose");
    if (closeNode) closeNode.addEventListener("click", bmCloseAuth);
    var cancelNode = bmById("authCancelBtn");
    if (cancelNode) cancelNode.addEventListener("click", bmCloseAuth);
    var overlay = bmById("authModalOverlay");
    bindStrictBackdropClose(overlay, bmCloseAuth);

    var tabLogin = bmById("authTabLogin");
    if (tabLogin) tabLogin.addEventListener("click", function () { bmSetAuthMode("login"); });
    var tabSignup = bmById("authTabSignup");
    if (tabSignup) tabSignup.addEventListener("click", function () { bmSetAuthMode("signup"); });

    var submitBtn = bmById("authSubmitBtn");
    if (submitBtn) submitBtn.addEventListener("click", function () { void bmSubmitAuth(); });
    var checkBtn = bmById("checkNicknameBtn");
    if (checkBtn) checkBtn.addEventListener("click", function () { void bmCheckNickname(); });

    var emailNode = bmById("authEmail");
    if (emailNode) {
      emailNode.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void bmSubmitAuth();
      });
    }
    var passwordNode = bmById("authPassword");
    if (passwordNode) {
      passwordNode.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void bmSubmitAuth();
      });
    }
    var confirmNode = bmById("authPasswordConfirm");
    if (confirmNode) {
      confirmNode.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void bmSubmitAuth();
      });
    }

    var nickNode = bmById("authNickname");
    if (nickNode) {
      nickNode.addEventListener("input", function () {
        bmResetNicknameCheck();
      });
      nickNode.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void bmCheckNickname();
      });
    }

    bmSetAuthMode("login");
  }

  function bmSetAuthMode(mode) {
    __bmAuthMode = mode === "signup" ? "signup" : "login";
    var isLogin = __bmAuthMode === "login";
    var tabLogin = bmById("authTabLogin");
    var tabSignup = bmById("authTabSignup");
    var hint = bmById("authHint");
    var signupOnly = bmById("authSignupOnly");
    var passwordNode = bmById("authPassword");
    var passwordPolicy = bmById("passwordPolicyHint");

    if (tabLogin) {
      tabLogin.classList.toggle("bg-slate-900", isLogin);
      tabLogin.classList.toggle("text-white", isLogin);
      tabLogin.classList.toggle("bg-white", !isLogin);
      tabLogin.classList.toggle("text-slate-900", !isLogin);
    }
    if (tabSignup) {
      tabSignup.classList.toggle("bg-slate-900", !isLogin);
      tabSignup.classList.toggle("text-white", !isLogin);
      tabSignup.classList.toggle("bg-white", isLogin);
      tabSignup.classList.toggle("text-slate-900", isLogin);
    }
    if (signupOnly) signupOnly.classList.toggle("hidden", isLogin);
    if (hint) {
      hint.textContent = isLogin
        ? "로그인 정보를 입력하세요."
        : "회원가입 정보를 입력하세요.";
    }
    if (passwordNode) {
      passwordNode.setAttribute("autocomplete", isLogin ? "current-password" : "new-password");
    }
    if (passwordPolicy) passwordPolicy.textContent = bmPasswordHintText();
    bmSetAuthError("");
    bmSetAuthBusy(false);
    if (!isLogin) {
      bmResetNicknameCheck();
    }
  }

  function bmOpenAuth(mode) {
    bmEnsureAuthModal();
    bmSetAuthMode(mode || "login");
    var overlay = bmById("authModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    window.setTimeout(function () {
      var emailNode = bmById("authEmail");
      if (emailNode) emailNode.focus();
    }, 0);
  }

  function bmCloseAuth() {
    var overlay = bmById("authModalOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
    bmSetAuthError("");
  }

  function bmToast(message, durationMs) {
    var toast = bmById("globalToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "globalToast";
      toast.className = "fixed hidden items-center justify-center bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900 text-white text-sm font-black z-[120]";
      document.body.appendChild(toast);
    }
    var duration = Math.max(800, Number(durationMs) || 1200);
    toast.textContent = message || "";
    toast.classList.remove("hidden");
    toast.classList.add("flex");
    window.setTimeout(function () {
      toast.classList.add("hidden");
      toast.classList.remove("flex");
    }, duration);
  }

  async function bmCheckNickname() {
    var raw = toStringSafe(bmById("authNickname") && bmById("authNickname").value);
    var checked = bmValidateNickname(raw);
    if (!checked.ok) {
      __bmNicknameChecked = false;
      __bmNicknameCheckedLower = "";
      bmSetNicknameStatus(checked.msg, false);
      return false;
    }

    var nick = checked.value;
    var nickLower = nick.toLowerCase();
    bmSetNicknameStatus("중복 확인 중...", null);
    try {
      var sb = getSb();
      var _a = await sb.from("profiles").select("user_id,nickname").filter("nickname", "ilike", nick).limit(20), data = _a.data, error = _a.error;
      if (error) throw error;
      var rows = data || [];
      var exists = rows.some(function (row) {
        return toStringSafe(row && row.nickname).trim().toLowerCase() === nickLower;
      });
      if (exists) {
        __bmNicknameChecked = false;
        __bmNicknameCheckedLower = "";
        bmSetNicknameStatus("이미 사용 중인 닉네임입니다.", false);
        return false;
      }
      __bmNicknameChecked = true;
      __bmNicknameCheckedLower = nickLower;
      bmSetNicknameStatus("사용 가능한 닉네임입니다.", true);
      return true;
    } catch (_b) {
      __bmNicknameChecked = false;
      __bmNicknameCheckedLower = "";
      bmSetNicknameStatus("닉네임 확인 중 오류가 발생했습니다.", false);
      return false;
    }
  }

  async function bmUpsertProfileNickname(sb, userId, nickname) {
    if (!userId || !nickname) return;
    var _a = await sb.from("profiles").upsert({ user_id: userId, nickname: nickname }, { onConflict: "user_id" }), error = _a.error;
    if (!error) return;
    var msg = toStringSafe(error.message).toLowerCase();
    if (msg.includes("profiles_nickname_lower_unique") || msg.includes("duplicate key")) {
      throw new Error("이미 사용 중인 닉네임입니다.");
    }
    throw error;
  }

  async function bmSubmitAuth() {
    if (__bmAuthBusy) return;
    var email = toStringSafe(bmById("authEmail") && bmById("authEmail").value).trim();
    var password = toStringSafe(bmById("authPassword") && bmById("authPassword").value);
    if (!email || !password) {
      bmSetAuthError("이메일/비밀번호를 입력하세요.");
      return;
    }

    var sb = getSb();
    bmSetAuthError("");
    bmSetAuthBusy(true);
    try {
      if (__bmAuthMode === "signup") {
        var nickRaw = toStringSafe(bmById("authNickname") && bmById("authNickname").value);
        var nickChecked = bmValidateNickname(nickRaw);
        if (!nickChecked.ok) throw new Error(nickChecked.msg);
        var nickLower = nickChecked.value.toLowerCase();
        if (!__bmNicknameChecked || __bmNicknameCheckedLower !== nickLower) {
          throw new Error("닉네임 중복확인을 먼저 진행하세요.");
        }

        var passwordCheck = bmValidatePassword(password);
        if (!passwordCheck.ok) throw new Error(passwordCheck.msg);

        var confirmPassword = toStringSafe(bmById("authPasswordConfirm") && bmById("authPasswordConfirm").value);
        if (password !== confirmPassword) throw new Error("비밀번호 확인이 일치하지 않습니다.");

        var _a = await sb.auth.signUp({
          email: email,
          password: password,
          options: { data: { nickname: nickChecked.value } }
        }), signupData = _a.data, signupError = _a.error;
        if (signupError) throw signupError;
        bmCloseAuth();
        if (signupData && signupData.session) {
          bmToast("회원가입 요청 완료");
        } else {
          bmToast("회원가입 요청 완료. 이메일 인증 메일 확인 후 로그인하세요.", 5000);
        }
        return;
      }

      var _b = await sb.auth.signInWithPassword({ email: email, password: password }), loginError = _b.error;
      if (loginError) throw loginError;
      bmCloseAuth();
      bmToast("로그인 성공");
    } catch (e) {
      bmSetAuthError(toStringSafe(e && e.message).trim() || "인증 실패");
    } finally {
      bmSetAuthBusy(false);
    }
  }

  async function bmSignOut() {
    try {
      await hardSignOut(getSb());
    } finally {
      bmToast("로그아웃");
    }
  }

  async function bmGetProfileNickname(userId) {
    var uid = toStringSafe(userId).trim();
    if (!uid) return "";
    try {
      var sb = getSb();
      var _a = await sb.from("profiles").select("nickname").eq("user_id", uid).maybeSingle(), data = _a.data, error = _a.error;
      if (error) return "";
      return toStringSafe(data && data.nickname).trim();
    } catch (_b) {
      return "";
    }
  }

  async function bmSetHeaderUI(session) {
    var token = __bmHeaderUiToken + 1;
    __bmHeaderUiToken = token;
    var signedIn = Boolean(session && session.user);
    var welcomeText = bmById("welcomeText");
    var displayName = "";
    if (signedIn) {
      var userId = toStringSafe(session && session.user && session.user.id).trim();
      displayName = await bmGetProfileNickname(userId);
      if (token !== __bmHeaderUiToken) return;
      if (!displayName) displayName = "회원";
    }

    if (welcomeText) {
      if (signedIn) {
        welcomeText.textContent = displayName + "님";
        welcomeText.classList.remove("hidden");
      } else {
        welcomeText.classList.add("hidden");
        welcomeText.textContent = "";
      }
    }

    function toggle(id, show) {
      var node = bmById(id);
      if (!node) return;
      node.classList.toggle("hidden", !show);
    }

    toggle("btnLoginTop", !signedIn);
    toggle("btnSignupTop", !signedIn);
    toggle("btnLogoutTop", signedIn);
    toggle("btnLoginMobile", !signedIn);
    toggle("btnSignupMobile", !signedIn);
    toggle("btnLogoutMobile", signedIn);
  }

  function bmBindAuthButtons() {
    var bindings = [
      ["btnLoginTop", function () { bmOpenAuth("login"); }],
      ["btnSignupTop", function () { bmOpenAuth("signup"); }],
      ["btnLogoutTop", function () { void bmSignOut(); }],
      ["btnLoginMobile", function () { bmOpenAuth("login"); }],
      ["btnSignupMobile", function () { bmOpenAuth("signup"); }],
      ["btnLogoutMobile", function () { void bmSignOut(); }],
      ["authGateLoginBtn", function () { bmOpenAuth("login"); }],
      ["authGateSignupBtn", function () { bmOpenAuth("signup"); }]
    ];

    for (var i = 0; i < bindings.length; i += 1) {
      var item = bindings[i];
      var id = item[0];
      var handler = item[1];
      var node = bmById(id);
      if (!node || node.__bmAuthBound) continue;
      node.addEventListener("click", handler);
      node.__bmAuthBound = true;
    }
  }

  function bmShouldSkipAutoAuthInit() {
    return Boolean(window.__bmunhakInlineAuthHandled);
  }

  async function bmInit(options) {
    var force = Boolean(options && options.force);
    if (!force && bmShouldSkipAutoAuthInit()) return;
    if (__bmAuthInitDone) return;
    __bmAuthInitDone = true;
    bmEnsureAuthModal();
    bmBindAuthButtons();

    var sb = getSb();
    try {
      var _a = await sb.auth.getSession(), data = _a.data;
      await bmSetHeaderUI(data && data.session);
    } catch (_b) {
      await bmSetHeaderUI(null);
    }

    if (!__bmAuthStateBound) {
      __bmAuthStateBound = true;
      sb.auth.onAuthStateChange(function (_event, session) {
        bmBindAuthButtons();
        void bmSetHeaderUI(session);
      });
    }
  }

  window.JungdapApp = Object.assign({}, window.JungdapApp || {}, {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    VALID_SECTIONS: VALID_SECTIONS,
    SECTION_META: SECTION_META,
    getSb: getSb,
    fetchLatestPosts: fetchLatestPosts,
    fetchPostsBySections: fetchPostsBySections,
    formatYmd: formatYmd,
    escapeHtml: escapeHtml,
    getNicknameMap: getNicknameMap,
    getProfileNickname: bmGetProfileNickname,
    parseSectionSlug: parseSectionSlug,
    isMissingColumnError: isMissingColumnError,
    isNoticePost: isNoticePost,
    getKakaoOpenChatUrl: getKakaoOpenChatUrl,
    sanitizeFilename: sanitizeFilename,
    formatFileSize: formatFileSize,
    urlCache: urlCache,
    resolveStorageUrl: resolveStorageUrl,
    resolveBoardUploadUrl: resolveBoardUploadUrl,
    resolveAvatarUrl: resolveAvatarUrl,
    setupMobileMenu: setupMobileMenu,
    setupContactModal: setupContactModal,
    setupAuthModal: bmEnsureAuthModal,
    openAuth: bmOpenAuth,
    closeAuth: bmCloseAuth,
    signOut: bmSignOut,
    toast: bmToast,
    init: bmInit,
    hardSignOut: hardSignOut,
    setupSecretRoomHover: setupSecretRoomHover,
    classifyRecentCommentPlus: classifyRecentCommentPlus
  });

  window.getSb = getSb;
  window.fetchLatestPosts = fetchLatestPosts;
  window.fetchPostsBySections = fetchPostsBySections;
  window.formatYmd = formatYmd;
  window.escapeHtml = escapeHtml;
  window.getNicknameMap = getNicknameMap;
  window.getProfileNickname = bmGetProfileNickname;
  window.getKakaoOpenChatUrl = getKakaoOpenChatUrl;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { void bmInit(); }, { once: true });
  } else {
    void bmInit();
  }
})(window);
