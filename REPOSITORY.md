# GeoSyntra Platform — repository documentation

**Workspace folder:** `GeoSyntra` (rename from `Geo-Intelligence` in File Explorer if needed; paths in this repo are relative and stay valid).

> **GitHub Pages:** The `deploy-pages.yml` workflow builds the app and syncs `frontend/dist` to the **root of `main`** (commits tagged `[pages-sync]`). In **Settings → Pages**, set **Deploy from a branch** → **main** → **/(root)**. Root deploy outputs are **gitignored** locally; only CI should commit them (avoids embedding local `.env` secrets). The SPA fallback shell is **`Geosyntra.html`**; **`404.html`** is linked to it (hard link or symlink) so GitHub Pages can serve 404 routes without duplicating the HTML blob.
>
> **App URL (HashRouter):** https://alkamelgis.github.io/Geosyntra/#/

Geosyntra Platform is a monorepo containing a React/Vite frontend and an Express backend.

## Project Structure

```text
.
├─ frontend/
│  ├─ src/
│  │  ├─ components/      # reusable UI and shared widgets
│  │  ├─ pages/           # page-level features
│  │  ├─ services/        # storage/network services
│  │  ├─ store/           # app-wide state/context
│  │  ├─ utils/           # helper utilities
│  │  ├─ types/           # shared TS types
│  │  └─ styles/          # global style assets
│  ├─ public/             # static assets
│  └─ config/
├─ backend/
│  ├─ server/             # current runtime entrypoint
│  ├─ src/
│  │  ├─ config/
│  │  ├─ routes/
│  │  │  ├─ v1/
│  │  │  └─ v2/
│  │  ├─ controllers/
│  │  ├─ middleware/
│  │  ├─ models/
│  │  └─ services/
│  ├─ tests/
│  └─ docs/
└─ .github/workflows/
```

## Requirements

- Node.js 18+
- npm 9+

## Install

From repository root (portable — any folder path):

```bash
npm install
npm run setup
npm run validate
```

See **[DEVELOPER_SETUP.md](DEVELOPER_SETUP.md)** for VS Code, `.env`, and moving the project between computers.

## Development

- Frontend + backend:

```bash
npm run dev
```

- Frontend only:

```bash
npm run dev:client
```

- Backend only:

```bash
npm run dev:server
```

## Production vs development data

User accounts, API keys, and settings must **not** live inside this git repository in production. See **[docs/PLATFORM_DEPLOYMENT.md](docs/PLATFORM_DEPLOYMENT.md)** for staging/production split, `GEOSYNTRA_DATA_DIR`, migrations, and CI workflows.

- `main` → GitHub Pages (static UI for users)
- `dev` → staging builds only (does not overwrite Pages)
- API host → persistent volume at `/data` (`docker-compose.production.yml`)

## Build and Preview

```bash
npm run build
npm run preview
```

Frontend output is generated in `frontend/dist`.

## Testing

```bash
npm run typecheck
npm test
npm run test:e2e
```

## Notes

- System settings are stored in browser `localStorage` (see `frontend/src/services/settingsStorage.ts` for the storage key).
- Versioned backend routes are available under `/api/v1` and `/api/v2`.
- Existing legacy API endpoints remain backward-compatible.
