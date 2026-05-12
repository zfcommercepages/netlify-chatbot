/**
 * POST /api/chat — forwards to the agent webhook (no direct Anthropic call).
 */
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 12000;
const MAX_CONTEXT_CHARS = 32000;
const MAX_USER_PROMPT_CHARS = 120000;

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

function buildSystemPrompt(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const storeName = String(c.storeName != null ? c.storeName : "the store").slice(0, 200);
  const storeBase = String(c.storeBase != null ? c.storeBase : "").slice(0, 500);
  const verticals = String(c.verticals != null ? c.verticals : "general retail").slice(0, 2000);
  const policies = String(
    c.policies != null ? c.policies : "Use the store website for official policies."
  ).slice(0, 8000);
  const products = String(c.productsContext != null ? c.productsContext : "None yet.").slice(
    0,
    MAX_CONTEXT_CHARS
  );
  return (
    `You are a friendly shopping assistant for ${storeName} (${storeBase}). ` +
    `The store sells: ${verticals}. ` +
    "Help with product fit, materials, electronics specs when plausible from context, " +
    "furniture dimensions or assembly when mentioned, home decor styling, pricing, shipping, returns, and coupons. " +
    "If product details are unknown, stay within safe general retail guidance and suggest checking the product page. " +
    "2–3 sentences max. Plain text only, no markdown.\n\n" +
    "Store policies (may be edited by the merchant; if something conflicts with the product page, defer to the site):\n" +
    policies +
    "\n\nWhen the customer wants to browse inside the chat widget, they can use phrases like " +
    '"list all categories", "list all collections", or "browse all products" for structured lists and tiles.\n\n' +
    "Products recently shown in the chat (name, price, options, short blurb):\n" +
    products
  );
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const slice = raw.slice(-MAX_MESSAGES);
  const out = [];
  for (const m of slice) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role) continue;
    let content = typeof m.content === "string" ? m.content : "";
    if (content.length > MAX_MESSAGE_CHARS) content = content.slice(0, MAX_MESSAGE_CHARS);
    out.push({ role, content });
  }
  return out;
}

function formatTranscript(messages) {
  return messages
    .map((m) => (m.role === "user" ? "User" : "Assistant") + ": " + m.content)
    .join("\n\n");
}

function buildAgentUserPrompt(system, messages) {
  const transcript = formatTranscript(messages);
  const combined =
    "Instructions and store context:\n" + system + "\n\n---\n\nConversation:\n" + transcript;
  return combined.length > MAX_USER_PROMPT_CHARS
    ? combined.slice(0, MAX_USER_PROMPT_CHARS)
    : combined;
}

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function extractReplyFromAgent(data) {
  if (data == null) return null;
  if (typeof data === "string") return data.trim() || null;
  if (typeof data !== "object") return null;

  const direct =
    data.reply ||
    data.text ||
    data.response ||
    data.output ||
    data.message ||
    data.answer ||
    data.content_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const d = data.data || {};
  const r = data.result || {};
  const p = data.payload || {};
  const nested =
    (typeof d.text === "string" && d.text) ||
    (typeof d.reply === "string" && d.reply) ||
    (typeof r.text === "string" && r.text) ||
    (typeof r.reply === "string" && r.reply) ||
    (typeof p.text === "string" && p.text) ||
    (typeof p.reply === "string" && p.reply);
  if (typeof nested === "string" && nested.trim()) return nested.trim();

  const blocks = data.content;
  if (Array.isArray(blocks) && blocks[0] && typeof blocks[0].text === "string") {
    return blocks[0].text.trim() || null;
  }

  return null;
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

  const messages = sanitizeMessages(body.messages);
  if (!messages.length) {
    return new Response(
      JSON.stringify({ error: "messages must be a non-empty array of {role, content}" }),
      { status: 400, headers }
    );
  }
  if (messages[messages.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "last message must be from user" }), {
      status: 400,
      headers,
    });
  }

  const system = buildSystemPrompt(body.context);
  const userPrompt = buildAgentUserPrompt(system, messages);

  const agentBody = {
    type: "generate",
    user_prompt: userPrompt,
    sampling_params: {
      temperature: numEnv("AGENT_TEMPERATURE", 0.3),
      top_p: numEnv("AGENT_TOP_P", 0.9),
      top_k: numEnv("AGENT_TOP_K", 15),
      max_tokens: numEnv("AGENT_MAX_TOKENS", 768),
    },
    model: (process.env.AGENT_MODEL || "claude-sonnet-4-6").trim(),
  };

  const callbackEndpoint = (process.env.AGENT_CALLBACK_ENDPOINT || "").trim();
  if (callbackEndpoint) {
    agentBody.endpoint = callbackEndpoint;
  }

  const reqHeaders = {
    Accept: "*/*",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  const extraHeadersRaw = (process.env.AGENT_EXTRA_HEADERS_JSON || "").trim();
  if (extraHeadersRaw) {
    try {
      const extra = JSON.parse(extraHeadersRaw);
      if (extra && typeof extra === "object" && !Array.isArray(extra)) {
        for (const [k, v] of Object.entries(extra)) {
          if (typeof k === "string" && k && typeof v === "string") reqHeaders[k] = v;
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  let ar;
  try {
    ar = await fetch(agentUrl, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(agentBody),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Agent webhook unreachable", detail: String(e) }), {
      status: 502,
      headers,
    });
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
    const plain = text.trim();
    if (plain) {
      return new Response(JSON.stringify({ reply: plain }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: "Invalid agent response (not JSON)" }), {
      status: 502,
      headers,
    });
  }

  const reply =
    extractReplyFromAgent(data) || "I'm not sure — try browsing the store!";

  return new Response(JSON.stringify({ reply }), { status: 200, headers });
};
