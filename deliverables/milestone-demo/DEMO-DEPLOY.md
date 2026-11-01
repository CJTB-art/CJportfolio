# Milestone demo copy

This is a static, local-only portfolio demo. The seeded account and transactions are invented examples. Changes are stored only under the `cj_ms_` localStorage namespace in this browser.

## Before deploying

The response policy in `vercel.json` allows the portfolio's GitHub Pages origin (`https://cjtb-art.github.io`). If the portfolio is published on a custom domain instead, replace the GitHub Pages origin with that domain's HTTPS origin (no path or trailing slash). This is required for the portfolio iframe to display the demo.

## Deploy with Vercel

From this folder, run:

```powershell
vercel login
vercel link
vercel --prod
```

Choose the Vercel project that serves `ms-nine-mocha.vercel.app` when linking. Set the project root to this folder and the output directory to `.` (Other framework preset). The local directory is already the ready-to-deploy static output; no build command is needed.

## Preview locally

From this folder, run `python -m http.server 4173` and open `http://localhost:4173/#/dashboard`. The page defaults to the dashboard and seeds fake data on first load. Use **Reset demo** to reseed it.

No authentication, cloud sync, push notifications, service worker, or server calls are included in this copy. Browser storage can be unavailable in private browsing; the app then keeps changes in memory for the current page session.
