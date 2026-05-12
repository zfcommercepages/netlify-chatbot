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
   | `ANTHROPIC_API_KEY` | Yes |
   | `ALLOWED_ORIGINS` | Yes (comma-separated Zoho storefront HTTPS origins) |
   | `WIDGET_SECRET` | No |
   | `ANTHROPIC_MODEL` | No |

   See `.env.example` for descriptions.

4. Deploy. Use your site URL (no trailing slash) for both asset base and chat API in Zoho, e.g. `https://your-site.netlify.app`.

## Zoho theme embed

Copy **`client/zoho-embed-hosted.html`** into your Zoho Commerce theme (before `</body>`). Set `WIDGET_ASSET_BASE` and `CHAT_BACKEND_URL` (`FF_CHATBOT_CONFIG.CHAT_BACKEND_URL`) to the same Netlify origin.

## Updating the widget

Edit **`public/widget/widget.css`** and **`public/widget/widget.js`** in this repository, commit, and push. Netlify will publish the new files on the next build.

## Timeouts

Netlify Functions have a **duration limit** (often ~10s on the free tier). If Claude responses exceed it, upgrade the plan or host the chat API elsewhere and keep only static assets on Netlify.
