# PASA public demo copy

This copy adds a public `/demo` study route. It uses a small set of invented sample questions and stores its progress only under the `cj_pasa_` browser-storage namespace. The `/demo` route does not create a Supabase client, read or write accounts, or render admin controls.

## Before deploying

1. `src/hooks.server.js` allows the portfolio's GitHub Pages origin (`https://cjtb-art.github.io`). If the portfolio is published on a custom domain instead, replace the GitHub Pages origin with that domain's HTTPS origin (no path or trailing slash).
2. Confirm the Wrangler worker name `pasa` is the one attached to `pasa.besinanchristejan.workers.dev`.
3. Copy `.env.example` to `.env` and enter the project's existing public Supabase URL and anon key so the rest of the app can build. These values are not used by `/demo`; do not put a service-role key in this file.

## Build and deploy to Cloudflare Workers

Run these commands from this folder in PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Edit .env with the existing public app values before continuing.
npm.cmd run build
npx.cmd wrangler login
npx.cmd wrangler deploy
```

The Worker serves the app bundle and static assets from the directory configured in `wrangler.jsonc`. The hook sets `frame-ancestors 'self'` on all routes; `/demo` allows this site and the portfolio origin above, and removes `X-Frame-Options` only for that route. The page can send an optional readiness message, but the portfolio also accepts the iframe's normal load event.

## Preview locally

After installing dependencies and configuring `.env`, run `npm.cmd run dev` and open `http://localhost:8000/demo`. The route can also run without persistent storage; in that case changes remain in memory until the tab closes.
