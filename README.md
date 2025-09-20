# TT Racing — Read‑Only Viewer (Computed Standings)

This version **computes standings** from your schema:
- per‑race `results[].byDriver` (with `qualiPos`, `racePos`, `qDNP`, `dnf`)
- season `points.quali[]` and `points.race[]`
- race‑level `adjustments` (bonus/malus points per driver)
- drivers are read from `drivers[]`

## Deploy on GitHub Pages
1. Upload `index.html`, `app.js`, `styles.css`, and **your** `data.json` to the repo root.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / root.
3. Open `https://<user>.github.io/<repo>/`

That's it. No editing controls; everything is read‑only.
