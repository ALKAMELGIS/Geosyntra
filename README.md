# GeoSyntra Platform

Enterprise GIS SaaS monorepo — **portable** across machines (relative paths + env-based config only).

The repo supports **two production stacks** on the same VPS, plus local development for each:

| Surface | Frontend | API | Database (production) |
|---------|----------|-----|------------------------|
| **Classic** | React + Vite → `www.geosyntra.org` | Express (Node) → `api.geosyntra.org` | PostgreSQL `geosyntra_express` |
| **Rust preview** | Dioxus (WASM) → `app.geosyntra.org` | Axum (Rust) → `:3003` behind nginx | PostgreSQL `geosyntra_axum` |

Local dev defaults to **SQLite** (Express) or **`geosyntra_dev` Postgres on `:5433`** (Axum). Set `DATABASE_URL` to use Postgres for Express locally.

---

## Quick start — React + Express (classic)

```bash
npm install
npm run dev
```

- **Frontend:** `http://localhost:5173/Geosyntra/`
- **API:** `http://localhost:3001`

Full guide: **[DEVELOPER_SETUP.md](DEVELOPER_SETUP.md)** · VS Code: **`geosyntra.code-workspace`**

Copy env templates (never commit filled copies):

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp hostinger.secrets.env.example hostinger.secrets.env   # deploy only — gitignored
```

---

## Quick start — Dioxus + Axum (Rust)

Requires Rust, Postgres, and (for WASM UI) `dioxus-cli`:

```bash
nix develop          # optional — pins toolchain + dev Postgres helpers
./scripts/dev-postgres.sh start
./scripts/dev-dioxus-with-axum.sh
```

- **UI:** `http://localhost:8080` (Dioxus dev server)
- **API:** `http://localhost:3003`

Or build/run the API binary directly:

```bash
export DATABASE_URL=postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev
cargo run -p geosyntra-api
```

**Dev bootstrap login** (non-production only): `admin@geosyntra.com` / `GeoSyntra-Admin-2026!`

Architecture and task plans: **[migration/dioxus-axum-plan.md](migration/dioxus-axum-plan.md)** · **[migration/clean-architecture-guidelines.md](migration/clean-architecture-guidelines.md)**

---

## Production VPS (Hostinger / NixOS)

| Host | Stack | Deploy |
|------|-------|--------|
| `www.geosyntra.org` | React static | `geosyntra-deploy production` |
| `api.geosyntra.org` | Express | (same command) |
| `app.geosyntra.org` | Dioxus + Axum | `geosyntra-deploy staging` |

**Windows:** **[docs/DEPLOY-FROM-WINDOWS.md](docs/DEPLOY-FROM-WINDOWS.md)** (WSL2 recommended)

### NixOS + `geosyntra-deploy`

Install the CLI once:

```bash
cd Geosyntra
nix profile install .#geosyntra-deploy
geosyntra-deploy --help
```

Full VPS / NixOS guide: **[migration/nixos-hostinger-vps.md](migration/nixos-hostinger-vps.md)**

```bash
# Read-only backup from live VPS (does not change production)
geosyntra-deploy backup pull
geosyntra-deploy backup list

# Deploy stacks
geosyntra-deploy production    # React + Express → www + api
geosyntra-deploy staging       # Dioxus + Axum → app

# NixOS (destructive install — only after backup pull)
geosyntra-deploy nixos install --confirm
geosyntra-deploy nixos switch
```

**PostgreSQL namespaces** on NixOS (`nix/database-namespaces.nix`):

| Database | Used by |
|----------|---------|
| `geosyntra_express` | Express (`api.geosyntra.org`) |
| `geosyntra_axum` | Axum (`app.geosyntra.org`) |
| `geosyntra_gis` | GIS / future services |

**Secrets on NixOS** use [sops-nix](https://github.com/Mic92/sops-nix):

```bash
cp secrets/.sops.yaml.example secrets/.sops.yaml
cp secrets/api.yaml.example secrets/api.yaml
# fill from backup restore-ready/, then:
sops encrypt secrets/api.yaml
```

Never commit `secrets/api.yaml`, `secrets/.sops.yaml`, or `secrets/vps-root-password.nix`.

---

## Secrets and tokens — do not commit

**Never put API keys, OAuth client secrets, JWT secrets, DB passwords, or SSH keys in git.**

| File / path | Purpose |
|-------------|---------|
| `.env`, `backend/.env` | Local dev — **gitignored** |
| `hostinger.secrets.env` | VPS deploy credentials — **gitignored** |
| `secrets/api.yaml` | sops-encrypted production env — **gitignored** |
| `secrets/vps-root-password.nix` | NixOS root hash — **gitignored** |
| `migration/vps-backup/` | Pulled env + DB dumps — **gitignored** |
| `backend/server/geosyntra_api_secrets.json` | Runtime token vault — **gitignored** |
| Root `assets/`, `index.html` | CI GitHub Pages build — **gitignored** (CI commits via `[pages-sync]`) |

**API tokens** (Mapbox, Gemini, OpenAI, Sentinel Hub, …) belong on the **server** (`MAPBOX_TOKEN`, vault, or sops), not in `VITE_*` frontend vars for production builds.

Verify before push:

```bash
node scripts/verify-no-secrets-in-git.mjs
npm run build && node scripts/verify-pages-bundle-no-secrets.mjs
```

CI runs both checks on `main` / PRs.

---

## GitHub Pages (demo UI only)

Live demo: **[alkamelgis.github.io/Geosyntra](https://alkamelgis.github.io/Geosyntra/#/)** (HashRouter)

The [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) workflow builds with **empty** public env vars and syncs output to the **`main` branch root** with a `[pages-sync]` commit. In **Settings → Pages**, use **Deploy from a branch** → **`main`** → **`/(root)`**.

- Root `assets/` and HTML shells are **gitignored locally** — only CI should commit them.
- **`Geosyntra.html`** is the SPA shell; **`404.html`** links to it for GitHub Pages routing.
- Production auth and data live on **`api.geosyntra.org`**, not Pages.

**Updates not live?**

1. Merge to **`main`** and confirm **Deploy to GitHub Pages** succeeded in Actions.
2. Hard refresh (Ctrl+F5) — Pages caches static assets aggressively.
3. Do not use **`[pages-sync]`** in your own commit messages (workflow skips those to avoid loops).

---

## Repository layout

```text
frontend/          React + Vite (classic UI)
backend/server/    Express API
packages/          Rust workspace (domain, application, infrastructure, interface, web, api)
nix/               NixOS modules, geosyntra-deploy, database namespaces
scripts/           Deploy, dev, backup, secret verification
migration/         Axum migration plans, VPS/NixOS runbooks
e2e/dioxus/        Playwright tests for Dioxus UI
```

More detail: **[REPOSITORY.md](REPOSITORY.md)**

---

## Tests

```bash
npm test                              # frontend unit tests
node scripts/verify-no-secrets-in-git.mjs
./scripts/run-api-integration-tests.sh   # Axum + Postgres
./scripts/run-dioxus-playwright.sh       # Dioxus E2E (needs running stack)
```
