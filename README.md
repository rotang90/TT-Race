# TT Racing — Read‑Only Viewer

A minimal **read‑only** GitHub Pages viewer for your league portal that:
- **Fetches `data.json` from the same repo** (no local upload needed by viewers).
- Lets people **click through seasons and tabs** (Standings, Races, Drivers, Lifetime).
- **Disables all editing** (no drag‑drop, no inputs).

## How to deploy on GitHub Pages

1. Create a new repo (e.g. `TT-Racing`) and **upload these files**:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `data.json` ← **Use your saved JSON from earlier and rename it to `data.json`.**
2. In the repo settings → **Pages** → set **Source** to “Deploy from a branch”, then select `main` and folder `root`.
3. Visit `https://<your-username>.github.io/<repo-name>/`

> Caching: The app uses `cache: "no-store"` to avoid stale JSON on refresh.

## Using a raw GitHub URL (optional)
If you keep `data.json` in a different repo/path, open `app.js` and replace:
```js
// return "https://raw.githubusercontent.com/<user>/<repo>/<branch>/data.json";
```
with your **raw** JSON URL.

## Schema notes
The viewer tries to auto-detect keys (e.g., `seasons`, `races`, `drivers`, `standings`, `lifetime`).
If your JSON uses different names, it will still render what it can and show a gentle message where data is missing.

