import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

type HomeWizardRedirectProps = {
  wizard?: 'auth' | 'pricing'
  authMode?: 'signup' | 'signin'
}

/** Sends legacy auth/pricing routes to Home with wizard query flags. */
export function HomeWizardRedirect({ wizard = 'auth', authMode = 'signup' }: HomeWizardRedirectProps) {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('start', '1')
    params.set('wizard', wizard)
    if (wizard === 'auth') params.set('mode', authMode)
    navigate(`/?${params.toString()}`, { replace: true })
  }, [navigate, wizard, authMode])

  return null
}
