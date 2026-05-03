# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages

الموقع: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني `frontend/dist` ويدفع الموقع إلى فرع **`gh-pages`** (لا يُلتزم `frontend/dist` في `main`). جذر **`main`** لا يحتوي `index.html` للواجهة حتى لا يُنشر بالخطأ محتوى يتعارض مع التطبيق.

**الإعداد** في [Settings → Pages](https://github.com/ALKAMELGIS/AgroCloud/settings/pages): **Deploy from a branch** → **`gh-pages`** → **`/(root)`** (أو **GitHub Actions** إن كنت تستخدم نشر الأرشيف فقط).

**إصلاح تلقائي (اختياري):** سر **`PAGES_ADMIN_TOKEN`** — راجع التعليق في سير النشر.

**English:** Workflow pushes the built SPA to **`gh-pages`**. Configure **Pages** to **`gh-pages` / (root)** or **GitHub Actions**. Optional secret **`PAGES_ADMIN_TOKEN`** can align legacy branch settings via API (see workflow).

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
