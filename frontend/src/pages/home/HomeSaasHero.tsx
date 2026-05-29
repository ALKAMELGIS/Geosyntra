import type { ReactNode } from 'react'
import type { HomeSaasHeroCopy } from './homeSaasContent'
import { HomeHeroAccessButton } from './HomeHeroAccessButton'
import type { HomeHeroAccessMode } from './homeHeroAccess'

export type HomeSaasHeroProps = {
  copy: HomeSaasHeroCopy
  /** Optional extra slot above the headline (logo, CMS banner). */
  preface?: ReactNode
  accessAction: {
    mode: HomeHeroAccessMode
    label: ReactNode
    onClick: () => void
    'aria-label'?: string
  }
}

export function HomeSaasHero({ copy, preface, accessAction }: HomeSaasHeroProps) {
  return (
    <div className="home-saas-hero home-saas-hero--globe home-saas-hero--globe-centered">
      <div className="home-saas-hero__content">
        {preface ? <div className="home-saas-hero__preface">{preface}</div> : null}

        <h1 id="home-hero-heading" className="home-saas-hero__title home-saas-hero__anim home-saas-hero__anim--1">
          <span className="home-saas-hero__headline-stack">
            <span className="home-saas-hero__line-before">
              <span className="home-saas-hero__headline-brand">{copy.globeBrand}</span>
              {' '}
              {copy.lineBefore}
            </span>
            <span className="home-saas-hero__accent-orbit">
              <span className="home-saas-hero__orbit-ring" aria-hidden>
                <span className="home-saas-hero__satellite">
                  <i className="fa-solid fa-satellite" aria-hidden />
                </span>
              </span>
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
              </span>
            </span>
          </span>
          <span className="home-saas-hero__globe-gutter" aria-hidden />
        </h1>

        <div className="home-saas-hero__globe-foot home-saas-hero__anim home-saas-hero__anim--2">
          <p className="home-saas-hero__subtitle">{copy.subtitle}</p>

          <div className="home-saas-hero__cta home-saas-hero__anim home-saas-hero__anim--3">
            <HomeHeroAccessButton
              mode={accessAction.mode}
              onClick={accessAction.onClick}
              aria-label={accessAction['aria-label']}
            >
              {accessAction.label}
            </HomeHeroAccessButton>
          </div>
          <div
            className="home-merged-saas__scroll-hint home-saas-hero__scroll-hint home-saas-hero__scroll-cue"
            role="img"
            aria-label="Scroll down to explore the platform"
          >
            <svg
              className="home-saas-hero__scroll-arrow"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M12 5v12M7 14l5 5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
