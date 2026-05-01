import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../lib/i18n'
import {
  AGRO_CLOUD_EMBED_CHANGED_EVENT,
  AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT,
  DEFAULT_AGRO_CLOUD_DASHBOARD_URL,
  isValidEmbedUrl,
  readAgroCloudDashboardUrl,
  readAgroCloudKeepAlive,
  resetAgroCloudDashboardUrl,
  writeAgroCloudDashboardUrl,
  writeAgroCloudKeepAlive,
} from '../../lib/agroCloudDashboardStorage'
import './dashboard-settings.css'

export default function DashboardSettings() {
  const { language } = useLanguage()
  const [draft, setDraft] = useState(readAgroCloudDashboardUrl)
  const [pinDashboard, setPinDashboard] = useState(readAgroCloudKeepAlive)
  const [flash, setFlash] = useState<string | null>(null)

  const copy = useMemo(
    () =>
      language === 'ar'
        ? {
            title: 'إعدادات لوحة التحكم',
            lead: 'اضبط رابط لوحة ArcGIS المدمجة في صفحة «لوحة Agro Cloud». يُخزَّن الرابط في المتصفح فقط.',
            urlLabel: 'رابط ArcGIS Dashboard',
            pinHeading: 'سلوك العرض',
            pinLabel: 'تثبيت اللوحة عند التنقل (بدون إعادة تحميل)',
            pinHint:
              'عند التفعيل تبقى اللوحة محمّلة في الخلفية عند الانتقال لصفحات أخرى والعودة، وهو مناسب عندما يكون الرابط ثابتاً.',
            save: 'حفظ',
            reset: 'الافتراضي',
            hint: 'الافتراضي: لوحة ArcGIS التابعة لـ EAP.',
            invalid: 'الرابط غير صالح (استخدم http/https)',
            saved: 'تم الحفظ.',
            savedPin: 'تم حفظ تفضيل العرض.',
          }
        : {
            title: 'Dashboard Settings',
            lead: 'Set the ArcGIS Dashboard URL embedded on the Agro Cloud Dashboard page. Stored in your browser only.',
            urlLabel: 'ArcGIS Dashboard URL',
            pinHeading: 'Display behavior',
            pinLabel: 'Keep dashboard loaded when switching pages',
            pinHint:
              'When on, the embedded view stays in memory while you browse other pages and return — avoids reload and loading spinners for a fixed URL.',
            save: 'Save',
            reset: 'Use default',
            hint: 'URL is stored in your browser only.',
            invalid: 'Invalid URL — use https://…',
            saved: 'Saved.',
            savedPin: 'Display preference saved.',
          },
    [language],
  )

  useEffect(() => {
    setDraft(readAgroCloudDashboardUrl())
  }, [])

  useEffect(() => {
    const sync = () => setPinDashboard(readAgroCloudKeepAlive())
    window.addEventListener(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3200)
    return () => window.clearTimeout(t)
  }, [flash])

  const handleSave = useCallback(() => {
    const next = draft.trim()
    if (!isValidEmbedUrl(next)) {
      setFlash(copy.invalid)
      return
    }
    try {
      writeAgroCloudDashboardUrl(next)
      setFlash(copy.saved)
    } catch {
      setFlash(copy.invalid)
    }
  }, [draft, copy.invalid, copy.saved])

  const handleReset = useCallback(() => {
    setDraft(DEFAULT_AGRO_CLOUD_DASHBOARD_URL)
    try {
      resetAgroCloudDashboardUrl()
      setFlash(copy.saved)
    } catch {
      setFlash(copy.invalid)
    }
  }, [copy.saved])

  const handlePinChange = useCallback(
    (checked: boolean) => {
      setPinDashboard(checked)
      writeAgroCloudKeepAlive(checked)
      setFlash(copy.savedPin)
    },
    [copy.savedPin],
  )

  return (
    <div className="page dashboard-settings-page">
      <header className="dashboard-settings-header">
        <h1 className="dashboard-settings-title">{copy.title}</h1>
        <p className="dashboard-settings-lead">{copy.lead}</p>
      </header>

      <section className="dashboard-settings-card" aria-labelledby="dash-url-heading">
        <h2 id="dash-url-heading" className="dashboard-settings-card-heading">
          {copy.urlLabel}
        </h2>
        <input
          id="master-agro-dash-url"
          className="dashboard-settings-input"
          aria-label={copy.urlLabel}
          type="url"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          placeholder={DEFAULT_AGRO_CLOUD_DASHBOARD_URL}
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div className="dashboard-settings-actions">
          <button type="button" className="gis-btn gis-btn-primary" onClick={handleSave}>
            {copy.save}
          </button>
          <button type="button" className="gis-btn gis-btn-outline" onClick={handleReset}>
            {copy.reset}
          </button>
          {flash ? (
            <span
              className={
                flash === copy.invalid ? 'dashboard-settings-flash err' : 'dashboard-settings-flash ok'
              }
            >
              {flash}
            </span>
          ) : null}
        </div>
        <p className="dashboard-settings-hint">
          {language === 'ar' ? (
            <>الافتراضي: لوحة ArcGIS على نطاق EAP. الرابط يُحفظ محلياً في هذا المتصفح.</>
          ) : (
            <>
              Embedded from{' '}
              <a href={DEFAULT_AGRO_CLOUD_DASHBOARD_URL} target="_blank" rel="noreferrer">
                ArcGIS Dashboards (EAP)
              </a>
              . Change the URL above if your organization hosts a different dashboard.
            </>
          )}
        </p>
      </section>

      <section className="dashboard-settings-card dashboard-settings-card-pin" aria-labelledby="dash-pin-heading">
        <h2 id="dash-pin-heading" className="dashboard-settings-card-heading">
          {copy.pinHeading}
        </h2>
        <label className="dashboard-settings-pin-row">
          <input
            type="checkbox"
            className="dashboard-settings-pin-checkbox"
            checked={pinDashboard}
            onChange={e => handlePinChange(e.target.checked)}
          />
          <span className="dashboard-settings-pin-text">{copy.pinLabel}</span>
        </label>
        <p className="dashboard-settings-pin-hint">{copy.pinHint}</p>
      </section>
    </div>
  )
}
