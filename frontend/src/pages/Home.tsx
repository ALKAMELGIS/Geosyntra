import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import LandingPage from '@/components/ui/landing-page'

export { homeMenuItems, type MenuItem, type SubMenuItem } from '@/config/homeMenu'

export default function Home() {
  const location = useLocation()
  const initialOpenGroupId = useMemo(() => {
    const state = location.state as { openGroup?: string } | null
    return state?.openGroup
  }, [location.state])

  return <LandingPage key={initialOpenGroupId ?? 'home'} initialOpenGroupId={initialOpenGroupId} />
}
