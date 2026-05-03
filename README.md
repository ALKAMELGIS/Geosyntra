# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages — إصلاح صفحة التحذير الصفراء / fix the yellow warning page

الموقع بعد النشر: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني `frontend/dist` ويدفع الموقع إلى فرع **`gh-pages`** (تاريخ orphan — لا يُلتزم البناء في `main`).

**الإعداد الموصى به (مرة واحدة)** في [Settings → Pages](https://github.com/ALKAMELGIS/AgroCloud/settings/pages):

1. **Build and deployment** → **Source** → **Deploy from a branch**.
2. **Branch** اختر **`gh-pages`** وليس `main`، والمجلد **`/ (root)`**.
3. احفظ، ثم انتظر نجاح آخر تشغيل في [Actions](https://github.com/ALKAMELGIS/AgroCloud/actions/workflows/deploy-pages.yml) (أو ادفع إلى `main`).

إذا كان المصدر ما زال **`main` / (root)** سيُعرض ملف التحذير في جذر المستودع وليس التطبيق.

**اختياري:** يمكن أيضًا ضبط المصدر على **GitHub Actions**؛ السير يحاول النشر بالأرشيف أيضًا (إن وُجدت البيئة `github-pages`)، لكن **gh-pages** كافٍ لإصلاح الصفحة الصفراء.

**English:** The workflow always pushes the build to **`gh-pages`**. Set **Pages → Deploy from a branch** → **gh-pages** → **/** (not `main` at root). Optionally enable **GitHub Actions** as Pages source too — the workflow tries artifact deploy but will not fail the run if that path is not configured.

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
