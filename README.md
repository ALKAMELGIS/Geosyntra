# Geosyntra Platform

## [Open the app](https://alkamelgis.github.io/Geosyntra/#/)

### GitHub Pages

Live URL: `https://alkamelgis.github.io/Geosyntra/#/` (HashRouter).

The [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) workflow builds the frontend with **empty** public environment variables, copies the output to the **`main` branch root**, and pushes with the `[pages-sync]` tag. In **Settings → Pages**, use **Deploy from a branch** → **`main`** → **`/(root)`**.

**SPA shell (no duplicate HTML bytes):** The built shell is written as **`Geosyntra.html`**. **`404.html`** is a **hard link** (or symlink on platforms that disallow hard links) to `Geosyntra.html`, because GitHub Pages only recognizes `404.html` for unknown paths — you do not maintain two separate copies of the same file content.

**Important:** Root `assets/` and `index.html` are listed in `.gitignore` so they are **not** committed from your local machine (that avoids embedding local `.env` secrets and push-protection issues). Updates are applied **via CI only**.

**404 even though files exist on `main`?** Pages may still be set to **GitHub Actions (workflow)** instead of branch publishing. The workflow runs `scripts/ensure-pages-legacy-main.mjs` to force **legacy + main + /(root)**. If the API rejects the default `GITHUB_TOKEN`, add a **`PAGES_ADMIN_TOKEN`** repository secret (repo admin scope with Contents).

**Updates not live?**

1. Ensure changes are **merged to `main`** (not only a feature branch) and that the latest push produced a successful **Deploy to GitHub Pages** run in **Actions**.
2. If the workflow failed or did not run: **Actions** → **Deploy to GitHub Pages** → **Run workflow** manually on **`main`**.
3. The live site serves **`index.html` and `assets/` at the root of `main`** after the CI build — not directly from `frontend/src`.
4. Try a **hard refresh** (Ctrl+F5) or a private window; GitHub Pages can cache static assets aggressively.
5. Do **not** put **`[pages-sync]`** in your own commit message when you expect a deploy (the workflow skips commits whose message starts with that text to avoid infinite loops).

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
