import { Link } from 'react-router-dom'
import {
  GEOSYNTRA_BRAND_LOGO_SVG,
  GEOSYNTRA_BRAND_NAME,
  GEOSYNTRA_BRAND_TAGLINE,
} from '../../lib/brand'
import { homeFooterColumns, homeFooterSocial } from './homeFooterContent'

export type HomeSaasFooterProps = {
  browseMode?: boolean
  onTrial?: () => void
  onSignIn?: () => void
}

function FooterLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  const isHash = href.startsWith('#')
  const isMail = href.startsWith('mailto:')
  const isInternal = href.startsWith('/') && !isHash

  const className = 'home-saas-footer__link'

  if (isHash) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    )
  }

  if (isInternal && !external) {
    return (
      <Link to={href} className={className}>
        {label}
      </Link>
    )
  }

  return (
    <a
      href={href}
      className={className}
      {...(external || isMail || href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </a>
  )
}

export function HomeSaasFooter({ browseMode = false, onTrial, onSignIn }: HomeSaasFooterProps) {
  const year = new Date().getFullYear()

  return (
    <footer
      id="footer"
      className={`home-saas-footer${browseMode ? ' home-saas-footer--browse' : ''}`}
      aria-label="Site footer"
    >
      <div className="home-saas-footer__glow" aria-hidden />
      <div className="home-saas-footer__inner">
        <div className="home-saas-footer__brand-row">
          <div className="home-saas-footer__brand">
            <span className="home-saas-footer__logo" dangerouslySetInnerHTML={{ __html: GEOSYNTRA_BRAND_LOGO_SVG }} />
            <div className="home-saas-footer__brand-text">
              <span className="home-saas-footer__brand-name">{GEOSYNTRA_BRAND_NAME}</span>
              <span className="home-saas-footer__brand-tag">
                {GEOSYNTRA_BRAND_TAGLINE} &middot; Earth Observation
              </span>
            </div>
          </div>
          <p className="home-saas-footer__pitch">
            Precision satellite intelligence, spatial analytics, and publication-ready reporting, unified in one
            geospatial AI workspace.
          </p>
        </div>

        <div className="home-saas-footer__grid">
          {homeFooterColumns.map(col => (
            <div key={col.title} className="home-saas-footer__col">
              <h3 className="home-saas-footer__col-title">{col.title}</h3>
              <ul className="home-saas-footer__col-list">
                {col.links.map(link => (
                  <li key={`${col.title}-${link.label}`}>
                    <FooterLink {...link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="home-saas-footer__rule" aria-hidden />

        <div className="home-saas-footer__actions-row">
          <div className="home-saas-footer__social" aria-label="Social links">
            {homeFooterSocial.map(s => (
              <a
                key={s.label}
                href={s.href}
                className="home-saas-footer__social-btn"
                aria-label={s.label}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className={s.icon} aria-hidden />
              </a>
            ))}
          </div>

          <div className="home-saas-footer__store-row">
            {onTrial ? (
              <button type="button" className="home-saas-footer__store home-saas-footer__store--primary" onClick={onTrial}>
                <span className="home-saas-footer__store-kicker">Launch</span>
                <span className="home-saas-footer__store-title">Web Platform</span>
                <span className="home-saas-footer__store-sub">Free trial &middot; No install</span>
              </button>
            ) : null}
            {onSignIn ? (
              <button type="button" className="home-saas-footer__store" onClick={onSignIn}>
                <span className="home-saas-footer__store-kicker">Access</span>
                <span className="home-saas-footer__store-title">Sign in</span>
                <span className="home-saas-footer__store-sub">Your workspace</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="home-saas-footer__rule home-saas-footer__rule--soft" aria-hidden />

        <div className="home-saas-footer__bottom">
          <p className="home-saas-footer__copy">
            &copy; {year} {GEOSYNTRA_BRAND_NAME}. All rights reserved.
          </p>
          <p className="home-saas-footer__meta">
            <span>Geospatial AI</span>
            <span className="home-saas-footer__dot" aria-hidden />
            <span>Remote sensing</span>
            <span className="home-saas-footer__dot" aria-hidden />
            <span>Scientific GIS</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
