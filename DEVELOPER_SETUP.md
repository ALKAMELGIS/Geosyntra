# GeoSyntra — Developer setup (portable)

GeoSyntra is an **npm workspaces** monorepo. The project uses **only relative paths** and environment variables — you can copy or clone the folder to any Windows/Mac/Linux machine without breaking GIS tools, OAuth, Mapbox, symbology, timeline, or deployment.

## Requirements

| Tool | Version |
|------|---------|
| Node.js | **18.18+** (`.nvmrc` recommends 20) |
| npm | **9+** |

## Quick start (any computer)

```bash
# 1. Open the repo folder in VS Code (or use geosyntra.code-workspace)

# 2. Install all dependencies (frontend + backend workspaces)
npm install

# 3. Create local .env from examples (automatic on install; or run manually)
npm run setup

# 4. Validate environment (optional)
npm run validate

# 5. Start full stack — Vite :5173 + API :3001
npm run dev
```

**Windows:** double-click `dev.cmd` or run the same commands in Command Prompt.

### Backend only

```bash
cd backend
npm install   # only if not using root workspaces install
npm start
```

From repo root (recommended):

```bash
npm run dev:server
```

## VS Code

1. Open **`geosyntra.code-workspace`** (multi-root: platform + frontend + backend).
2. Install **recommended extensions** when prompted.
3. **Run and Debug** → **GeoSyntra: Full stack** (or use Terminal → `npm run dev`).

No machine-specific paths are required in workspace settings.

## Environment files

| File | Purpose |
|------|---------|
| `.env.example` | Reference for all platform variables |
| `frontend/.env.example` | SPA / Vite / Mapbox / OAuth redirects |
| `backend/.env.example` | API / Passport / SQLite / SMTP |
| `hostinger.secrets.env.example` | Production deploy (gitignored) |

`npm run setup` copies `*.env.example` → `.env` **only when missing** (never overwrites your keys).

**Never commit:**

- `frontend/.env`, `backend/.env`, `hostinger.secrets.env`
- `backend/server/data/`, `*.db`, `agri_api_secrets.json`

**Never use** `C:\Users\...` or other absolute paths in `.env` — use URLs and relative data paths (`AGRI_DATA_DIR=data`).

## Architecture

```text
GeoSyntra/
├── frontend/          React + Vite + Mapbox GL (GIS UI, symbology, AOI, swipe, timeline)
├── backend/server/    Express API, OAuth, SQLite, API vault
├── scripts/           Portable setup & validation
├── .github/workflows/ CI / GitHub Pages / staging
├── docker-compose*.yml
└── package.json       npm workspaces root
```

- **Data** lives under `backend/server/data/` by default (gitignored, portable relative path).
- **Production** mounts `AGRI_DATA_DIR` on a volume **outside** the git clone ([docs/PLATFORM_DEPLOYMENT.md](docs/PLATFORM_DEPLOYMENT.md)).

## npm scripts (root)

| Script | Description |
|--------|-------------|
| `npm install` | Install workspaces + run `setup` |
| `npm run setup` | Create `.env` files and data directories |
| `npm run validate` | Check Node, deps, env, DB paths |
| `npm run dev` | Frontend + backend (with quick validate) |
| `npm run dev:client` | Vite only |
| `npm run dev:server` | API only |
| `npm run build` | Production frontend build |
| `npm test` | Frontend unit tests |

## Moving the project to another PC

1. Copy the **entire folder** (or `git clone`).
2. Do **not** copy another machine’s `node_modules` if npm errors occur — delete and run `npm install`.
3. Copy your `frontend/.env` and `backend/.env` if you need the same API keys (or run `npm run setup` and re-enter secrets).
4. Copy `backend/server/data/*.db` only if you want the same local users/tokens.
5. Open in VS Code → `npm run dev`.

Git remotes, Hostinger deploy, and GitHub Pages workflows are unchanged.

## OAuth & APIs (local)

Default local URLs (Geosyntra only — **do not share ports with AgroCloud**):

| | Geosyntra (this repo) | AgroCloud (`AgroCloud-main`, separate repo) |
|---|---|---|
| App | `http://localhost:5173/Geosyntra/` | `http://localhost:5174/AgroCloud/` |
| API | `http://localhost:3001` | `http://localhost:3011` |
| WebSocket | `http://localhost:3002` | `http://localhost:3012` |

- App: `http://localhost:5173/Geosyntra/`
- API: `http://localhost:3001`
- OAuth return: `http://localhost:5173/Geosyntra/oauth-return.html`

Configure Google / GitHub / LinkedIn consoles to match `backend/.env` and `frontend/.env`. See [EMAIL_AND_OAUTH_SETUP.md](EMAIL_AND_OAUTH_SETUP.md).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm run dev` fails validate | `npm run setup` then `npm install` |
| Map blank / no basemap | Set `VITE_MAPBOX_TOKEN` in `frontend/.env` |
| OAuth redirect mismatch | Align redirect URIs in provider console + both `.env` files |
| Port in use | Geosyntra uses 5173/3001/3002 only; AgroCloud uses 5174/3011/3012 in its own repo — run `dev:client:clean` / `dev:clean` to free ports |
| SQLite errors | Delete `backend/server/data/*.db` and restart API (dev only) |

## More documentation

- [REPOSITORY.md](REPOSITORY.md) — structure, CI, testing
- [README.md](README.md) — GitHub Pages & live URL
- [EMAIL_AND_OAUTH_SETUP.md](EMAIL_AND_OAUTH_SETUP.md) — production OAuth + SMTP
