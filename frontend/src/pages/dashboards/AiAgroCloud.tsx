import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../lib/i18n'
import './AiAgroCloud.css'

/** Match Home → Satellite Imagery hub accent (violet tile header). */
const HUB_ACCENT = '#8B5CF6'

function getIconKey(icon: string): string {
  const parts = icon.split(/\s+/).filter(Boolean)
  const specific = parts.find(p => p.startsWith('fa-') && p !== 'fa-solid' && p !== 'fa-regular' && p !== 'fa-brands')
  return (specific || '').replace(/^fa-/, '').replace(/[^a-z0-9-]/gi, '')
}

export default function AiAgroCloud() {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const navigate = useNavigate()
  const [hubOpen, setHubOpen] = useState(true)

  const tiles = [
    {
      to: '/dashboards/ai-agro-chat',
      icon: 'fa-solid fa-comments',
      title: ar ? 'محادثة Agro الذكية' : 'AI Agro-Chat',
      desc: ar
        ? 'اسأل عن الحقول والطبقات والجداول بناءً على محتوى GIS.'
        : 'Ask about fields, layers, and tables using your GIS Content data.',
    },
    {
      to: '/master/gis-content',
      icon: 'fa-solid fa-map-location-dot',
      title: ar ? 'محتوى GIS' : 'GIS Content',
      desc: ar ? 'إدارة الطبقات المحفوظة من خريطة GIS في هذا المتصفح.' : 'Manage layers saved from GIS Map in this browser.',
    },
  ] as const

  return (
    <div className="page aac-root">
      <section className="aac-hub" aria-labelledby="aac-hub-title">
        <div className="aac-hub-card">
          <header className="aac-hub-header">
            <div className="aac-hub-header-row">
              <button
                type="button"
                className="back-btn"
                onClick={() => navigate(-1)}
                aria-label={ar ? 'رجوع' : 'Back'}
              >
                <i className="fa-solid fa-chevron-left" aria-hidden />
              </button>
              <div className="aac-hub-title">
                <span className="aac-hub-icon" style={{ backgroundColor: HUB_ACCENT }}>
                  <i className="fa-solid fa-cloud-bolt" aria-hidden />
                </span>
                <h1 id="aac-hub-title" className="aac-hub-heading">
                  {ar ? 'سحابة Agro الذكية' : 'AI AgroCloud'}
                </h1>
              </div>
              <button
                type="button"
                className="aac-hub-toggle"
                aria-expanded={hubOpen}
                aria-controls="aac-hub-tiles"
                onClick={() => setHubOpen(v => !v)}
              >
                <i className={`fa-solid ${hubOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden />
              </button>
            </div>
          </header>

          <div
            id="aac-hub-tiles"
            className={hubOpen ? 'aac-hub-tiles' : 'aac-hub-tiles aac-hub-tiles--closed'}
            role="region"
            aria-label={ar ? 'روابط سحابة Agro' : 'AI AgroCloud links'}
            hidden={!hubOpen}
          >
            {tiles.map(tile => (
              <Link key={tile.to} className="aac-hub-tile" to={tile.to}>
                <div className={`aac-hub-tile-icon aac-ico-${getIconKey(tile.icon)}`}>
                  <i className={tile.icon} aria-hidden />
                </div>
                <span className="aac-hub-tile-text">
                  <span className="aac-hub-tile-title">{tile.title}</span>
                  <span className="aac-hub-tile-desc">{tile.desc}</span>
                </span>
                <i className="fa-solid fa-chevron-right aac-hub-tile-chev" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
