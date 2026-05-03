# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages — إصلاح صفحة التحذير الصفراء / fix the yellow warning page

الموقع بعد النشر: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني `frontend/dist` ويدفع الموقع إلى فرع **`gh-pages`** (تاريخ orphan — لا يُلتزم البناء في `main`).

**الإعداد الواجب مرة واحدة** في [Settings → Pages](https://github.com/ALKAMELGIS/AgroCloud/settings/pages):

1. **Build and deployment** → **Source** → **Deploy from a branch**.
2. **Branch** اختر **`gh-pages`** وليس `main`، والمجلد **`/ (root)`**.
3. احفظ، ثم انتظر نجاح آخر تشغيل في [Actions](https://github.com/ALKAMELGIS/AgroCloud/actions/workflows/deploy-pages.yml) (أو ادفع إلى `main`).

إذا كان المصدر ما زال **`main` / (root)** سيُعرض ملف التحذير في جذر المستودع وليس التطبيق.

**English:** The workflow publishes the Vite build to the **`gh-pages`** branch. In **Settings → Pages**, set **Deploy from a branch** → **gh-pages** → **/** (root), **not** `main` at root (that only serves the yellow stub `index.html` on `main`).

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
