# storefront-chatbot-netlify

Self-contained Netlify site: **widget static files**, **`POST /api/chat`**, and **`GET /health`**. No other repository or submodule is required.

## What is deployed

| Path | Source |
|------|--------|
| `/widget/widget.css`, `/widget/widget.js` | `public/widget/` in this repo |
| `/api/chat` | `netlify/functions/chat.mjs` |
| `/api/poll` | `netlify/functions/poll.mjs` |
| `/health` | `netlify/functions/health.mjs` |

## Deploy on Netlify

1. Push this repository to GitHub/GitLab/Bitbucket.

2. In [Netlify](https://app.netlify.com/) → **Add new site** → import the repo. Build settings are read from `netlify.toml` (publish directory `public`, functions under `netlify/functions`).

3. **Environment variables** (Site → Environment variables):

   | Variable | Required |
   |----------|----------|
   | `AGENT_WEBHOOK_URL` | Yes — full URL of the agent receive webhook |
   | `ALLOWED_ORIGINS` | Yes — comma-separated Zoho storefront HTTPS origins |
   | `WIDGET_SECRET` | No |

   See `.env.example` for descriptions.

4. Deploy. Use your site URL (no trailing slash) for both asset base and chat API in Zoho, e.g. `https://your-site.netlify.app`

## How the chat flow works (async)

1. The widget POSTs `{ prompt, context }` to `/api/chat`. `context` is a JSON array of up to 5 `{ user_prompt, agent_response }` pairs maintained by the widget in `localStorage` (key `ff_history`), since the agent is stateless.
2. `chat.mjs` forwards the same body to `AGENT_WEBHOOK_URL`. The agent acknowledges immediately with `{ run_id, status:"pending", poll_url, stream_url, ... }`.
3. `chat.mjs` returns `{ run_id, poll_url }` (HTTP 202) where `poll_url` points at the Netlify proxy: `/api/poll?p=<encoded agent path>`. The agent host's origin is never exposed to the browser.
4. The widget stores the pending run in `localStorage` (key `ff_pending_run`) and polls `<CHAT_BACKEND_URL>/api/poll?p=...` **every 15 seconds**. Each call is forwarded server-side to the agent by `poll.mjs`, which validates that the target stays on `AGENT_WEBHOOK_URL`'s origin (SSRF guard).
5. On completion the widget reads `output`, appends `{ user_prompt, agent_response }` to history, persists it, clears `ff_pending_run`, and renders the response in the chat (truncated to 100 chars for display; the full text is kept in `context` for the next turn).

**Why the proxy?** The browser polls a Netlify URL (same origin as `/api/chat`), so no CORS headers are required on the agent host. This also keeps internal agent hosts (e.g. `http://10.93.9.49:8000`) hidden from end users

**Reachability note:** Netlify Functions run in the public cloud. A private URL like `http://10.93.9.49:8000/...` is only reachable from the function if that host is routable from the internet (VPN/tunnel, or deploy the agent on a public host). For local testing, use `netlify dev` from a network that can reach the agent.

## Zoho theme embed

Copy **`client/zoho-embed-hosted.html`** into your Zoho Commerce theme (before `</body>`). Set `WIDGET_ASSET_BASE` and `CHAT_BACKEND_URL` (`FF_CHATBOT_CONFIG.CHAT_BACKEND_URL`) to the same Netlify origin

## Updating the widget

Edit **`public/widget/widget.css`** and **`public/widget/widget.js`** in this repository, commit, and push. Netlify will publish the new files on the next build.

## Timeouts

Netlify Functions have a duration limit (often ~10s on the free tier). The trigger call only needs to wait for the agent's immediate async ack, so it stays well under that limit; long-running agent runs are handled entirely by browser-side polling and are not bound by the function timeout