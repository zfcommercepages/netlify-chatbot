/**
 * POST /api/chat — same contract as storefront-chatbot app/main.py (Netlify Functions / Node 18+).
 */
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 12000;
const MAX_CONTEXT_CHARS = 32000;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfiguration: missing ANTHROPIC_API_KEY" }),
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
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  let ar;
  try {
    ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages,
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Upstream AI unreachable", detail: String(e) }), {
      status: 502,
      headers,
    });
  }

  const text = await ar.text();
  if (!ar.ok) {
    return new Response(
      JSON.stringify({
        error: "Upstream AI error",
        status: ar.status,
        snippet: text.slice(0, 500),
      }),
      { status: 502, headers }
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid upstream response" }), {
      status: 502,
      headers,
    });
  }

  const blocks = data.content;
  const reply =
    (Array.isArray(blocks) && blocks[0] && blocks[0].text) || "I'm not sure — try browsing the store!";

  return new Response(JSON.stringify({ reply }), { status: 200, headers });
};
