# storefront-chatbot-netlify

Self-contained Netlify site: **widget static files**, **`POST /api/chat`**, and **`GET /health`**. No other repository or submodule is required.

## What is deployed

| Path | Source |
|------|--------|
| `/widget/widget.css`, `/widget/widget.js` | `public/widget/` in this repo |
| `/api/chat` | `netlify/functions/chat.mjs` |
| `/health` | `netlify/functions/health.mjs` |

## Deploy on Netlify

1. Push this repository to GitHub/GitLab/Bitbucket.

2. In [Netlify](https://app.netlify.com/) → **Add new site** → import the repo. Build settings are read from `netlify.toml` (publish directory `public`, functions under `netlify/functions`).

3. **Environment variables** (Site → Environment variables):

   | Variable | Required |
   |----------|----------|
   | `AGENT_WEBHOOK_URL` | Yes — full URL for `POST` with body `{ type, user_prompt, sampling_params, model, endpoint? }` |
   | `ALLOWED_ORIGINS` | Yes (comma-separated Zoho storefront HTTPS origins) |
   | `WIDGET_SECRET` | No |
   | `AGENT_MODEL` | No (default `claude-sonnet-4-6`) |
   | `AGENT_CALLBACK_ENDPOINT` | No — sets JSON field `endpoint` if your agent expects a callback URL |
   | `AGENT_TEMPERATURE`, `AGENT_TOP_P`, `AGENT_TOP_K`, `AGENT_MAX_TOKENS` | No — override `sampling_params` |
   | `AGENT_EXTRA_HEADERS_JSON` | No — JSON object of extra headers (strings only), e.g. `Origin` |

   Chat no longer calls Anthropic directly; it forwards to `AGENT_WEBHOOK_URL`. The widget still receives `{ "reply": "..." }`; the function maps several common JSON shapes from the agent into `reply`

   **Note:** Netlify runs in the public cloud. A private URL like `http://10.93.9.49:8000/...` is only reachable from the function if that host is routable from the internet (VPN/tunnel, or deploy the agent on a public host). For local testing, use `netlify dev` from a network that can reach the agent

   See `.env.example` for descriptions.

4. Deploy. Use your site URL (no trailing slash) for both asset base and chat API in Zoho, e.g. `https://your-site.netlify.app`

## Zoho theme embed

Copy **`client/zoho-embed-hosted.html`** into your Zoho Commerce theme (before `</body>`). Set `WIDGET_ASSET_BASE` and `CHAT_BACKEND_URL` (`FF_CHATBOT_CONFIG.CHAT_BACKEND_URL`) to the same Netlify origin

## Updating the widget

Edit **`public/widget/widget.css`** and **`public/widget/widget.js`** in this repository, commit, and push. Netlify will publish the new files on the next build

## Timeouts

Netlify Functions have a **duration limit** (often ~10s on the free tier). If Claude responses exceed it, upgrade the plan or host the chat API elsewhere and keep only static assets on Netlify
