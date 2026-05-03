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

**إصلاح من الجذور عبر السير (اختياري):** أضف في المستودع سرًا باسم **`PAGES_ADMIN_TOKEN`** (رمز شخصي Classic بصلاحية **`repo`**، أو رمز **Fine-grained** مع **Administration** و**Contents** على هذا المستودع فقط). بعدها يستدعي سير العمل واجهة GitHub تلقائيًا بعد كل دفع إلى `main` لتوجيه **Legacy Pages** إلى فرع **`gh-pages`** (ولا يُغيّر الإعداد إذا كان النشر أصلًا عبر **GitHub Actions** فقط).

**اختياري:** يمكن أيضًا ضبط المصدر على **GitHub Actions**؛ السير يحاول النشر بالأرشيف أيضًا (إن وُجدت البيئة `github-pages`)، لكن **gh-pages** كافٍ لإصلاح الصفحة الصفراء.

**English:** The workflow always pushes the build to **`gh-pages`**. Set **Pages → Deploy from a branch** → **gh-pages** → **/** (not `main` at root). Optionally enable **GitHub Actions** as Pages source too — the workflow tries artifact deploy but will not fail the run if that path is not configured.

**Root fix from CI (optional):** add repository secret **`PAGES_ADMIN_TOKEN`** — a classic PAT with **`repo`**, or a fine-grained PAT with **Administration** + **Contents** (read/write) on this repo only. The next [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) run will call the GitHub API to set **legacy** Pages to publish from **`gh-pages` / (root)** (it skips if Pages already uses **workflow** builds only).

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
