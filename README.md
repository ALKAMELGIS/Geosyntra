# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages

الموقع: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني الواجهة بمتغيرات عامة فارغة ثم يُنسَخ المخرج إلى **جذر `main`** ويُدفع بـ `[pages-sync]`. في الإعدادات: **Deploy from a branch** → **`main`** → **`/(root)`**.

**مهم:** ملفات `assets/` و`index.html` في الجذر مُدرجة في `.gitignore` — **لا تُلتقط من جهازك المحلي** (قد يُدمَج `.env` ويُرفض الدفع). التحديث يتم عبر **CI فقط**.

**إن ظهر 404 رغم وجود الملفات على `main`:** غالباً المصدر ما زال **GitHub Actions (workflow)** وليس نشراً من الفرع. سير النشر يشغّل `scripts/ensure-pages-legacy-main.mjs` لضبط **legacy + main + /**. إن رفض الـ API الرمز الافتراضي، أضف سر **`PAGES_ADMIN_TOKEN`** (صلاحية repo أو Administration+Contents).

**English:** If you see **404** while `index.html` exists on `main`, Pages may still be on **workflow** artifact mode. The workflow runs `ensure-pages-legacy-main.mjs` to force **branch publish from main**. Add **`PAGES_ADMIN_TOKEN`** if the API rejects `GITHUB_TOKEN`.

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
