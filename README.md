# Agro Cloud

## [→ افتح التطبيق / Open the app ←](https://alkamelgis.github.io/AgroCloud/#/)

### GitHub Pages — إصلاح صفحة التحذير الصفراء / fix the yellow warning page

الموقع الصحيح بعد النشر: `https://alkamelgis.github.io/AgroCloud/#/` (HashRouter).

إذا ظهرت صفحة **«Agro Cloud — إعداد GitHub Pages»** الصفراء على `https://alkamelgis.github.io/AgroCloud/` فالمستودع ما زال ينشر **جذر الفرع** وليس ناتج البناء. العلاج من الجذر (مرة واحدة في GitHub):

1. افتح [إعدادات Pages للمستودع](https://github.com/ALKAMELGIS/AgroCloud/settings/pages).
2. تحت **Build and deployment** غيّر **Source** من **Deploy from a branch** إلى **GitHub Actions**.
3. احفظ، ثم من [تبويب Actions](https://github.com/ALKAMELGIS/AgroCloud/actions/workflows/deploy-pages.yml) شغّل **Deploy to GitHub Pages** يدويًا أو ادفع إلى `main` ليبدأ النشر تلقائيًا.
4. انتظر نجاح الوظيفة `deploy` (أخضر). إذا علّق: **Settings → Environments → github-pages** (أزل مراجعي النشر إن وُجد).

بعدها يُستبدل محتوى الموقع بملفات `frontend/dist` من سير العمل [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) — **لا** تُلتزم `frontend/dist` في Git (حماية الدفع قد ترفض الحزم).

**English:** If you see the yellow **branch-deploy notice** at the repo root URL, Pages is still set to **Deploy from a branch** at `/`. Switch **Settings → Pages → Source** to **GitHub Actions**, then run or wait for the **Deploy to GitHub Pages** workflow; the live app is only the Vite build artifact from that workflow, not the root `index.html` stub.

**Documentation:** [REPOSITORY.md](REPOSITORY.md)
