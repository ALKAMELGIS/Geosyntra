# Geosyntra Platform

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/Geosyntra/#/)

### GitHub Pages

الموقع: `https://alkamelgis.github.io/Geosyntra/#/` (HashRouter).

سير العمل [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) يبني الواجهة بمتغيرات عامة فارغة ثم يُنسَخ المخرج إلى **جذر `main`** ويُدفع بـ `[pages-sync]`. في الإعدادات: **Deploy from a branch** → **`main`** → **`/(root)`**.

**مهم:** ملفات `assets/` و`index.html` في الجذر مُدرجة في `.gitignore` — **لا تُلتقط من جهازك المحلي** (قد يُدمَج `.env` ويُرفض الدفع). التحديث يتم عبر **CI فقط**.

**إن ظهر 404 رغم وجود الملفات على `main`:** غالباً المصدر ما زال **GitHub Actions (workflow)** وليس نشراً من الفرع. سير النشر يشغّل `scripts/ensure-pages-legacy-main.mjs` لضبط **legacy + main + /**. إن رفض الـ API الرمز الافتراضي، أضف سر **`PAGES_ADMIN_TOKEN`** (صلاحية repo أو Administration+Contents).

**English:** If you see **404** while `index.html` exists on `main`, Pages may still be on **workflow** artifact mode. The workflow runs `ensure-pages-legacy-main.mjs` to force **branch publish from main**. Add **`PAGES_ADMIN_TOKEN`** if the API rejects `GITHUB_TOKEN`.

**تحديثات لا تظهر على الموقع؟**

1. تأكد أن التعديل **مدمج على `main`** (وليس فرعاً فقط) وأن آخر دفع شغّل سير **Deploy to GitHub Pages** بنجاح في تبويب **Actions**.
2. إذا كان السير أحمر أو لم يعمل: من **Actions** → **Deploy to GitHub Pages** → **Run workflow** (يدوي على `main`).
3. الموقع الحي يقرأ **`index.html` و`assets/` في جذر الفرع `main`** بعد بناء CI — ليس من مجلد `frontend/src` مباشرة.
4. جرّب **تحديثاً قاسياً** للصفحة (Ctrl+F5) أو نافذة خاصة؛ GitHub Pages يخزّن الملفات الثابتة أحياناً بقوة.
5. لا تضع **`[pages-sync]`** في رسالة التزامك يدوياً إن كنت تتوقع تشغيل النشر (السير يتخطى الدفعات التي رسالتها تحتوي هذا النص لتجنب الحلقات).

**Updates not live?** Merge to **`main`**, confirm **Actions** run is green, **Run workflow** if needed, hard refresh; live site is **CI-built root on `main`**, not raw `frontend/` source.

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
