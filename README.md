# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages

الموقع: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني `frontend/dist` وينشره **فقط عبر GitHub Actions** (أرشيف `deploy-pages`)، وليس من فرع. لا تُلتزم `frontend/dist` في `main`.

**الإعداد** في [Settings → Pages](https://github.com/ALKAMELGIS/AgroCloud/settings/pages): المصدر **GitHub Actions** (لا تختر «نشر من فرع» — كان سبب تعارض 404 سابقاً).

**إن فشل ضبط المصدر تلقائياً:** أضف سر **`PAGES_ADMIN_TOKEN`** (كلاسيكي: نطاق **repo**؛ أو PAT دقيق: **Administration** + **Contents** على هذا المستودع) — يستخدمه [`scripts/ensure-pages-workflow-build.mjs`](scripts/ensure-pages-workflow-build.mjs).

**English:** Pages publishes **only** from the workflow artifact (`deploy-pages`). Set **Source: GitHub Actions**. Optional **`PAGES_ADMIN_TOKEN`** if the API cannot switch from legacy branch mode.

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
