import crypto from "crypto";
import busboy from "busboy";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { createClient } from "@supabase/supabase-js";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SCOPE = new Set(["post", "comment", "room"]);
const BOARD_BUCKET = "board-uploads";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const key = Object.keys(headers).find((k) => String(k).toLowerCase() === String(name).toLowerCase());
  return key ? String(headers[key] || "") : "";
}

function requestIdFrom(headers) {
  const fromHeader = getHeader(headers, "x-request-id");
  if (fromHeader) return fromHeader.slice(0, 64);
  return crypto.randomUUID();
}

function logEvent(level, eventName, payload = {}) {
  const line = JSON.stringify({ event: eventName, ...payload });
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function extractBearerToken(event) {
  const authz = getHeader(event?.headers, "authorization");
  if (!authz || !/^Bearer\s+/i.test(authz)) return "";
  return authz.replace(/^Bearer\s+/i, "").trim();
}

function parsePostId(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

async function parseMultipartBody(event) {
  const contentType = getHeader(event?.headers, "content-type");
  if (!/^multipart\/form-data/i.test(contentType)) {
    const error = new Error("지원하지 않는 콘텐츠 타입입니다.");
    error.statusCode = 400;
    throw error;
  }

  const rawBody = String(event?.body || "");
  const bodyBuffer = Buffer.from(rawBody, event?.isBase64Encoded ? "base64" : "utf8");

  return await new Promise((resolve, reject) => {
    let fileSeen = false;
    const fields = {};
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;

    const bb = busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fields: 20, fileSize: MAX_INPUT_BYTES },
    });

    bb.on("field", (name, value) => {
      if (!name) return;
      fields[String(name)] = String(value || "").trim();
    });

    bb.on("file", (name, file) => {
      if (name !== "file" || fileSeen) {
        file.resume();
        return;
      }
      fileSeen = true;

      file.on("data", (chunk) => {
        if (tooLarge) return;
        bytes += chunk.length;
        if (bytes > MAX_INPUT_BYTES) {
          tooLarge = true;
          return;
        }
        chunks.push(chunk);
      });

      file.on("limit", () => {
        tooLarge = true;
      });
    });

    bb.on("error", (err) => reject(err));

    bb.on("finish", () => {
      if (!fileSeen) {
        const error = new Error("파일이 필요합니다.");
        error.statusCode = 400;
        return reject(error);
      }
      if (tooLarge) {
        const error = new Error("파일 용량은 4MB 이하만 가능합니다.");
        error.statusCode = 413;
        return reject(error);
      }
      resolve({
        fields,
        inputBuffer: Buffer.concat(chunks),
      });
    });

    bb.end(bodyBuffer);
  });
}

export async function handler(event) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(event?.headers);
  const respond = (statusCode, body, level = "info", eventName = "upload_board_image_response") => {
    logEvent(level, eventName, {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      status_code: statusCode,
    });
    return json(statusCode, body);
  };

  try {
    if (event.httpMethod !== "POST") {
      return respond(405, { ok: false, message: "허용되지 않은 메서드입니다." }, "warn", "upload_board_image_method_not_allowed");
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) {
      return respond(500, { ok: false, message: "서버 설정이 누락되었습니다." }, "error", "upload_board_image_env_missing");
    }

    const accessToken = extractBearerToken(event);
    if (!accessToken) {
      return respond(401, { ok: false, message: "로그인이 필요합니다." }, "warn", "upload_board_image_no_token");
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    const userId = String(userData?.user?.id || "");
    if (userError || !userId) {
      return respond(401, { ok: false, message: "로그인이 필요합니다." }, "warn", "upload_board_image_invalid_token");
    }

    const { fields, inputBuffer } = await parseMultipartBody(event);

    const scopeRaw = String(fields.scope || "post").trim().toLowerCase();
    if (scopeRaw && !ALLOWED_SCOPE.has(scopeRaw)) {
      return respond(400, { ok: false, message: "유효하지 않은 업로드 범위입니다." }, "warn", "upload_board_image_invalid_scope");
    }

    const detected = await fileTypeFromBuffer(inputBuffer);
    if (!detected || !ALLOWED_MIME.has(String(detected.mime || "").toLowerCase())) {
      return respond(415, { ok: false, message: "지원하지 않는 이미지 형식입니다." }, "warn", "upload_board_image_unsupported_mime");
    }

    const transformed = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const outputBuffer = transformed.data;
    const outputInfo = transformed.info || {};
    if (outputBuffer.length > MAX_INPUT_BYTES) {
      return respond(413, { ok: false, message: "파일 용량은 4MB 이하만 가능합니다." }, "warn", "upload_board_image_output_too_large");
    }

    const postId = parsePostId(fields.post_id);
    const rand = crypto.randomBytes(4).toString("hex");
    const storagePath = postId
      ? `${postId}/${Date.now()}_${rand}.webp`
      : `tmp/${Date.now()}_${rand}.webp`;

    const { error: uploadError } = await admin.storage.from(BOARD_BUCKET).upload(storagePath, outputBuffer, {
      upsert: false,
      contentType: "image/webp",
    });
    if (uploadError) {
      return respond(500, { ok: false, message: "이미지 업로드에 실패했습니다." }, "error", "upload_board_image_storage_upload_failed");
    }

    return respond(200, {
      ok: true,
      storage_path: storagePath,
      mime: "image/webp",
      size_bytes: outputBuffer.length,
      width: Number(outputInfo.width || 0),
      height: Number(outputInfo.height || 0),
      post_id: postId,
      scope: scopeRaw || "post",
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
    }, "info", "upload_board_image_success");
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    const message = statusCode === 413
      ? "파일 용량은 4MB 이하만 가능합니다."
      : (statusCode === 400 ? "요청 형식이 올바르지 않습니다." : "이미지 처리 중 오류가 발생했습니다.");
    const level = statusCode >= 500 ? "error" : "warn";
    return respond(statusCode, { ok: false, message }, level, "upload_board_image_unhandled");
  }
}
