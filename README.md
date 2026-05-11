# storefront-chatbot-netlify

**Separate repo** from **`storefront-chatbot`**. Hosts on **Netlify**:

- Static **`/widget/widget.css`** and **`/widget/widget.js`** (copied at build time from the Python repo).
- Serverless **`POST /api/chat`** and **`GET /health`** (Node functions — Netlify does not run Python).

Canonical widget source lives in **`storefront-chatbot/static/`**. This repo should track that code via a **git submodule** named **`upstream`**.

## One-time setup

1. Create your **`storefront-chatbot`** repo on GitHub/GitLab and push the Python project.

2. Create this **`storefront-chatbot-netlify`** repo and clone it locally.

3. Add the submodule (replace URL):

   ```bash
   git submodule add https://github.com/YOUR_ORG/storefront-chatbot.git upstream
   git submodule update --init --recursive
   git add .gitmodules upstream
   git commit -m "Add upstream submodule for widget static files"
   git push
   ```

4. In **Netlify** → Site → **Build & deploy** → **Repository** → link this repo.  
   Ensure **submodules** are fetched (this repo sets `GIT_SUBMODULE_STRATEGY=recursive` in `netlify.toml`).

5. **Environment variables** (same names as the Python app):

   | Variable | Required |
   |----------|----------|
   | `ANTHROPIC_API_KEY` | Yes |
   | `ALLOWED_ORIGINS` | Yes (comma-separated Zoho storefront HTTPS origins) |
   | `WIDGET_SECRET` | No |
   | `ANTHROPIC_MODEL` | No |

6. Deploy. Set **`WIDGET_ASSET_BASE`** and **`CHAT_BACKEND_URL`** in Zoho to your Netlify site URL, e.g. `https://your-site.netlify.app`, using **`upstream` repo’s** `client/zoho-embed-hosted.html` as a template.

## Updating the widget

Change **`static/widget.css`** / **`static/widget.js`** in **`storefront-chatbot`**, push, then in **this** repo:

```bash
cd upstream && git pull origin main && cd ..
git add upstream
git commit -m "Bump upstream widget"
git push
```

Netlify will rebuild and publish new static files.

## Without submodule (not recommended)

You can temporarily copy `widget.css` / `widget.js` into `public/widget/` and commit them, but you then have **two sources of truth**. Prefer the submodule flow above.

## Timeouts

Netlify Functions have a **duration limit** (often ~10s on free tier). If Claude exceeds it, keep **Python** on Fly/Render for `/api/chat` and use Netlify only for static assets, or upgrade Netlify.
