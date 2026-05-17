import { useEffect } from 'react'
import { redirectToHomeWizard } from '../../lib/homeWizardEntry'

type HomeWizardRedirectProps = {
  wizard?: 'auth' | 'pricing'
  authMode?: 'signup' | 'signin'
}

/** Sends legacy auth/pricing routes to Home with wizard query flags. */
export function HomeWizardRedirect({ wizard = 'auth', authMode = 'signup' }: HomeWizardRedirectProps) {
  useEffect(() => {
    redirectToHomeWizard({ wizard, authMode })
  }, [wizard, authMode])

  return null
}
