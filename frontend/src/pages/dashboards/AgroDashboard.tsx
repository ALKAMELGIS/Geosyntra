import { useLanguage } from '../../lib/i18n'

const copy = {
  en: {
    title: 'Agro Dashboard',
    lead: 'A dedicated space for operational and agronomic KPIs. Extend this view with charts, tables, and live data as your workflows mature.',
    panel: 'This page is ready for your next dashboard build—use Develop Dashboard to prototype visuals, then embed or link them here.',
  },
  ar: {
    title: 'لوحة Agro',
    lead: 'مساحة مخصصة لمؤشرات العمليات والزراعة. وسّع العرض بالرسوم والجداول والبيانات الحية مع تقدم سير العمل.',
    panel: 'هذه الصفحة جاهزة لتوسيع لوحة التحكم—استخدم لوحة التطوير لتجربة العناصر ثم اربطها أو ضمّنها هنا.',
  },
} as const

export default function AgroDashboard() {
  const { language, direction } = useLanguage()
  const t = copy[language]

  return (
    <div className="page" dir={direction}>
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1.35rem, 2.5vw, 1.85rem)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--ds-color-text)',
          }}
        >
          {t.title}
        </h1>
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--ds-color-text-muted)',
            maxWidth: 640,
          }}
        >
          {t.lead}
        </p>
      </header>
      <section className="ds-surface" style={{ padding: '22px 24px', borderRadius: 12, border: '1px solid var(--ds-color-border)' }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ds-color-text-muted)' }}>{t.panel}</p>
      </section>
    </div>
  )
}
