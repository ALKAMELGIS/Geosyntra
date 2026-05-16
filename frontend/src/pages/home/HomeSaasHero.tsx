import type { ReactNode } from 'react'
import { SaasButton } from '../../components/saas/SaasEntryShell'
import type { HomeSaasHeroCopy } from './homeSaasContent'

export type HomeSaasHeroProps = {
  copy: HomeSaasHeroCopy
  /** Optional extra slot above the headline (logo, CMS banner). */
  preface?: ReactNode
  startAction: {
    label: ReactNode
    onClick: () => void
    'aria-label'?: string
  }
}

export function HomeSaasHero({ copy, preface, startAction }: HomeSaasHeroProps) {
  return (
    <div className="home-saas-hero">
      {preface ? <div className="home-saas-hero__preface">{preface}</div> : null}

      <h1 id="home-hero-heading" className="home-saas-hero__title home-saas-hero__anim home-saas-hero__anim--1">
        {copy.lineBefore}
        <br />
        <span className="home-saas-hero__accent-block">
          <span className="home-saas-hero__accent">{copy.accent}</span>
          <svg
            className="home-saas-hero__underline"
            viewBox="0 0 170 30"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M2 9C32.8203 5.34032 108.769 -0.881146 166 3.51047"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              opacity="0.9"
            />
          </svg>
        </span>{' '}
        {copy.lineAfter}
      </h1>

      <p className="home-saas-hero__subtitle home-saas-hero__anim home-saas-hero__anim--2">{copy.subtitle}</p>

      <div className="home-saas-hero__cta home-saas-hero__anim home-saas-hero__anim--3">
        <SaasButton
          size="lg"
          variant="primary"
          onClick={startAction.onClick}
          aria-label={startAction['aria-label']}
        >
          {startAction.label}
        </SaasButton>
      </div>
    </div>
  )
}
