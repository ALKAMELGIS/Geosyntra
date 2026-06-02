import { useCallback, useEffect, useState } from 'react'
import {
  ACCOUNT_PROFILE_CHANGE_EVENT,
  readGeosyntraAccountProfile,
  writeGeosyntraAccountProfile,
  type GeosyntraAccountProfileV2,
} from '../../../lib/account/geosyntraAccountProfile'

export function useGeosyntraAccountProfile(email: string | undefined) {
  const [profile, setProfile] = useState<GeosyntraAccountProfileV2>(() =>
    email ? readGeosyntraAccountProfile(email) : {},
  )

  useEffect(() => {
    if (!email) {
      setProfile({})
      return
    }
    const refresh = () => setProfile(readGeosyntraAccountProfile(email))
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener(ACCOUNT_PROFILE_CHANGE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(ACCOUNT_PROFILE_CHANGE_EVENT, refresh)
    }
  }, [email])

  const updateProfile = useCallback(
    (patch: Partial<GeosyntraAccountProfileV2>) => {
      if (!email) return
      const next = writeGeosyntraAccountProfile(email, patch)
      setProfile(next)
    },
    [email],
  )

  return { profile, updateProfile }
}
