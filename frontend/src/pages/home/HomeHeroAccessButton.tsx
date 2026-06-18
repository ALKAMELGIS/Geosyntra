import type { ReactNode } from 'react'
import type { HomeHeroAccessMode } from './homeHeroAccess'

export type HomeHeroAccessButtonProps = {
  mode: HomeHeroAccessMode
  children: ReactNode
  onClick: () => void
  'aria-label'?: string
}

export function HomeHeroAccessButton({ mode, children, onClick, 'aria-label': ariaLabel }: HomeHeroAccessButtonProps) {
  return (
    <button
      type="button"
      className={`home-hero-access-btn home-hero-access-btn--${mode}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className="home-hero-access-btn__glow" aria-hidden />
      <span className="home-hero-access-btn__label">{children}</span>
    </button>
  )
}
