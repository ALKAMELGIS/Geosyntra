# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages

الموقع: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني الواجهة بمتغيرات عامة فارغة ثم يُنسَخ المخرج إلى **جذر `main`** ويُدفع بـ `[pages-sync]`. في الإعدادات: **Deploy from a branch** → **`main`** → **`/(root)`**.

**مهم:** ملفات `assets/` و`index.html` في الجذر مُدرجة في `.gitignore` — **لا تُلتقط من جهازك المحلي** (قد يُدمَج `.env` ويُرفض الدفع). التحديث يتم عبر **CI فقط**.

**English:** CI syncs the built SPA to **repo root on `main`**. Pages: **main** / **(root)**. Root `assets/` etc. are **gitignored** — do not commit builds locally (push protection); CI commits them safely.

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
