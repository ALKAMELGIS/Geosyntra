import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
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
  secondaryAction?: {
    label: ReactNode
    onClick: () => void
    'aria-label'?: string
  }
}

export function HomeSaasHero({ copy, preface, startAction, secondaryAction }: HomeSaasHeroProps) {
  return (
    <div className="home-saas-hero home-saas-hero--globe">
      <div className="home-saas-hero__scrim" aria-hidden />
      <motion.div className="home-saas-hero__content">
      {preface ? <div className="home-saas-hero__preface">{preface}</div> : null}

      <h1 id="home-hero-heading" className="home-saas-hero__title home-saas-hero__anim home-saas-hero__anim--1">
        {copy.lineBefore}
        <br />
        <span className="home-saas-hero__accent-block">
          <span className="home-saas-hero__accent-marked">
            <span className="home-saas-hero__accent">{copy.accentHighlight}</span>
            <svg
              className="home-saas-hero__underline"
              viewBox="0 0 96 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                className="home-saas-hero__underline-path"
                pathLength={1}
                d="M2 10C30 6.5 62 5.5 92 8.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.88"
              />
            </svg>
          </span>
          <span className="home-saas-hero__accent-remainder">{copy.accentRemainder}</span>
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
        {secondaryAction ? (
          <SaasButton
            size="lg"
            variant="ghost"
            onClick={secondaryAction.onClick}
            aria-label={secondaryAction['aria-label']}
          >
            {secondaryAction.label}
          </SaasButton>
        ) : null}
      </div>
      </motion.div>
    </div>
  )
}
