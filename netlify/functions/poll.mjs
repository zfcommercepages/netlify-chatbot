/**
 * GET /api/poll?p=<url-encoded agent poll path>
 * Server-side proxy so the browser doesn't need CORS on the agent host.
 * Validates that the resolved target stays on AGENT_WEBHOOK_URL's origin (SSRF guard).
 */
function cors(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const h = { "Content-Type": "application/json" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Widget-Secret";
  }
  return h;
}

export default async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = cors(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  const agentUrl = (process.env.AGENT_WEBHOOK_URL || "").trim();
  if (!agentUrl) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration: missing AGENT_WEBHOOK_URL" }),
      { status: 500, headers }
    );
  }

  const secret = process.env.WIDGET_SECRET || "";
  if (secret && request.headers.get("x-widget-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const url = new URL(request.url);
  const p = url.searchParams.get("p");
  if (!p) {
    return new Response(JSON.stringify({ error: "missing p parameter" }), {
      status: 400,
      headers,
    });
  }

  let target;
  let agentOrigin;
  try {
    target = new URL(p, agentUrl);
    agentOrigin = new URL(agentUrl).origin;
  } catch {
    return new Response(JSON.stringify({ error: "invalid p parameter" }), {
      status: 400,
      headers,
    });
  }
  if (target.origin !== agentOrigin) {
    return new Response(JSON.stringify({ error: "target origin not allowed" }), {
      status: 400,
      headers,
    });
  }

  const authHeader = (process.env.AGENT_AUTH_HEADER || "Authorization").trim();
  const authValue = (process.env.AGENT_AUTH_VALUE || "").trim();

  let ar;
  try {
    const fwdHeaders = {
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    };
    if (authValue) fwdHeaders[authHeader] = authValue;
    ar = await fetch(target.href, {
      method: "GET",
      headers: fwdHeaders,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Agent host unreachable", detail: String(e) }),
      { status: 502, headers }
    );
  }

  const text = await ar.text();
  const passthroughHeaders = {
    ...headers,
    "Content-Type": ar.headers.get("content-type") || "application/json",
  };
  return new Response(text, { status: ar.status, headers: passthroughHeaders });
};