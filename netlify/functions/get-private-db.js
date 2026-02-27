// netlify/functions/get-private-db.js
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

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  return json(410, {
    ok: false,
    error: "ENDPOINT_DISABLED",
    message: "Raw private norming data is no longer exposed.",
  });
};
