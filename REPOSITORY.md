# Agri Cloud — repository documentation

> **GitHub Pages:** إذا ظهرت هذه الصفحة على الموقع بدل التطبيق، فاذهب إلى **Settings → Pages** واختر المصدر **GitHub Actions** وليس «Deploy from a branch». التطبيق يُنشر من `frontend/dist` عبر `.github/workflows/deploy-pages.yml`.
>
> **رابط التشغيل (HashRouter):** https://alkamelgis.github.io/AgroCloud/#/
>
> **GitHub Pages:** If the website shows documentation instead of the app, set **Settings → Pages → Source** to **GitHub Actions**. The build is published from `frontend/dist`.
>
> **App URL:** https://alkamelgis.github.io/AgroCloud/#/

Agri Cloud is a monorepo containing a React/Vite frontend and an Express backend.

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

- System settings are stored in browser localStorage under `agri_system_settings_v1`.
- Versioned backend routes are available under `/api/v1` and `/api/v2`.
- Existing legacy API endpoints remain backward-compatible.
