# Geosyntra Platform — repository documentation

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

From repository root:

```bash
npm install
```

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
