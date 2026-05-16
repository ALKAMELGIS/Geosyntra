import type { ReactNode } from 'react'
import { SaasButton } from '../../components/saas/SaasEntryShell'

/** Injected hero content for Home — copy and CTA live here, not in SaasEntryShell. */
export type HomeSaasHeroProps = {
  /** Optional slot above the primary action (headline, logo, CMS block). */
  lead?: ReactNode
  startAction: {
    label: ReactNode
    onClick: () => void
    'aria-label'?: string
  }
}

export function HomeSaasHero({ lead, startAction }: HomeSaasHeroProps) {
  return (
  <>
      {lead ? <div className="home-saas-hero__lead">{lead}</div> : null}
      <SaasButton
        size="lg"
        variant="primary"
        onClick={startAction.onClick}
        aria-label={startAction['aria-label']}
      >
        {startAction.label}
      </SaasButton>
    </>
  )
}
