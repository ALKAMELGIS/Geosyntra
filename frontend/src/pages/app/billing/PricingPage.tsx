import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'

/** Legacy route — pricing lives on Home (`#pricing`) with in-page wizard. */
export default function PricingPage() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate(`${SAAS_ROUTES.home}#pricing`, { replace: true })
  }, [navigate])
  return null
}
