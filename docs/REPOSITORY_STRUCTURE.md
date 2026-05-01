# هيكل المستودع / Repository layout

Monorepo بـ **npm workspaces** جاهز للنشر على GitHub.

| المسار | الوصف |
|--------|--------|
| **`frontend/`** | تطبيق **React + Vite + TypeScript** (`src/`, `public/`, `index.html`, إعداد البناء). |
| **`backend/`** | خادم **Node (Express)** و WebSocket (`backend/server/index.js`). يخدم واجهة API وملفات الإنتاج من `frontend/dist`. |
| **`config/`** | _(داخل `frontend/config`)_ إعدادات مسار التطبيق لـ Vite. |
| **`docs/`** | توثيق إضافي. |
| **`package.json`** (جذر) | يعرّف الـ workspaces ويمرّر الأوامر إلى `frontend` / `backend`. |

## بناء الإنتاج

- تشغيل `npm run build` من **جذر المستودع** يبني الواجهة إلى **`frontend/dist`**.
- الخلفية تقرأ المسار عبر `FRONTEND_DIST` أو تلقائياً `frontend/dist` نسبةً لجذر المستودع.

## متغيرات مفيدة

| المتغير | الغرض |
|---------|--------|
| `AGRI_FRONTEND_DIST` | مسار مطلق لمجلد `dist` إذا لم يكن الافتراضي مناسباً في النشر. |
