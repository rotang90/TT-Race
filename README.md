# Race League Manager — Read‑Only (v13‑style)

This build **looks like your v13.7 portal** (header, tabs, tables, dark/light theme) but is **read‑only**:
- No buttons to add/edit/drag anything
- No inputs, dialogs, or import/export
- Auto‑loads `./data.json` from the same GitHub Pages path
- Computes standings from `results` + `points` (quali/race) + per‑race `adjustments`
- Renders: Dashboard (Leaderboard, Positions chart, Summary, Upcoming), Drivers, Schedule, Results (view‑only), Points & Rules, Lifetime (table + chart)

## Deploy
1. Upload `index.html`, `styles.css`, `app.js` and your `data.json` to the repo root.
2. Enable GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root).
3. Open your Pages URL.

