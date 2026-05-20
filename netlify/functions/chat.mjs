/**
 * POST /api/chat — forwards { prompt, context } to AGENT_WEBHOOK_URL (async).
 * Returns { run_id, poll_url } so the widget can poll until status === "completed".
 */
function cors(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const h = { "Content-Type": "application/json" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Widget-Secret";
  }
  return h;
}

function sanitizeContext(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const user_prompt = String(item.user_prompt == null ? "" : item.user_prompt);
      const agent_response = String(item.agent_response == null ? "" : item.agent_response);
      if (!user_prompt && !agent_response) return null;
      return { user_prompt, agent_response };
    })
    .filter(Boolean);
}

export default async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = cors(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers });
  }

  const prompt = String(body && body.prompt != null ? body.prompt : "");
  if (!prompt.trim()) {
    return new Response(JSON.stringify({ error: "prompt must be a non-empty string" }), {
      status: 400,
      headers,
    });
  }

  const context = sanitizeContext(body && body.context);
  const agentBody = { prompt, context };

  let ar;
  try {
    ar = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(agentBody),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Agent webhook unreachable", detail: String(e) }),
      { status: 502, headers }
    );
  }

  const text = await ar.text();
  if (!ar.ok) {
    return new Response(
      JSON.stringify({
        error: "Agent webhook error",
        status: ar.status,
        snippet: text.slice(0, 500),
      }),
      { status: 502, headers }
    );
  }

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid agent response (not JSON)" }),
      { status: 502, headers }
    );
  }

  const runId = data && (data.run_id || data.id);
  if (!runId) {
    return new Response(
      JSON.stringify({ error: "Agent did not return run_id", agent: data }),
      { status: 502, headers }
    );
  }

  const pollPath = "/api/agents/builder/runs/detail/" + encodeURIComponent(runId);
  const proxyPath = "/api/poll?p=" + encodeURIComponent(pollPath);
  return new Response(JSON.stringify({ run_id: runId, poll_url: proxyPath }), {
    status: 202,
    headers,
  });
};