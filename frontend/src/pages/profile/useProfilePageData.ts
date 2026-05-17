import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../state/auth'
import {
  readUserProfileExtended,
  USER_PROFILE_CHANGE_EVENT,
  writeUserProfileExtended,
  type UserProfileExtended,
} from '../../lib/account/userProfileStore'
import {
  imageFileToAvatarDataUrl,
  writeGeosyntraAccountProfile,
} from '../../lib/account/geosyntraAccountProfile'
import { useGeosyntraAccountProfile } from '../home/profile/useGeosyntraAccountProfile'
import { buildProfileViewModel } from './buildProfileViewModel'
import type { ProfileViewModel } from './types'

const LOADING_MS = 420

export function useProfilePageData() {
  const { user, logout } = useAuth()
  const { profile: avatarProfile, updateProfile: updateAvatar } = useGeosyntraAccountProfile(user?.email)
  const [extended, setExtended] = useState<UserProfileExtended>(() =>
    user?.email ? readUserProfileExtended(user.email) : {},
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user?.email) {
      setExtended({})
      setLoading(false)
      return
    }
    setLoading(true)
    const t = window.setTimeout(() => {
      setExtended(readUserProfileExtended(user.email))
      setLoading(false)
    }, LOADING_MS)
    return () => window.clearTimeout(t)
  }, [user?.email])

  useEffect(() => {
    if (!user?.email) return
    const refresh = () => setExtended(readUserProfileExtended(user.email))
    window.addEventListener('storage', refresh)
    window.addEventListener(USER_PROFILE_CHANGE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(USER_PROFILE_CHANGE_EVENT, refresh)
    }
  }, [user?.email])

  const viewModel: ProfileViewModel | null = user
    ? buildProfileViewModel(user, extended)
    : null

  const patchExtended = useCallback(
    (patch: Partial<UserProfileExtended>) => {
      if (!user?.email) return
      const next = writeUserProfileExtended(user.email, patch)
      setExtended(next)
    },
    [user?.email],
  )

  const savePersonal = useCallback(
    async (fields: Pick<UserProfileExtended, 'phone' | 'country' | 'organization'>) => {
      if (!user?.email) return
      setSaving(true)
      try {
        patchExtended(fields)
      } finally {
        setSaving(false)
      }
    },
    [patchExtended, user?.email],
  )

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!user?.email) return
      setSaving(true)
      try {
        const dataUrl = await imageFileToAvatarDataUrl(file)
        updateAvatar({ avatarDataUrl: dataUrl })
        patchExtended({
          activity: [
            {
              id: `act-${Date.now()}`,
              type: 'upload',
              title: 'Avatar updated',
              detail: 'New profile photo saved',
              at: new Date().toISOString(),
            },
            ...(extended.activity ?? []).slice(0, 12),
          ],
        })
      } finally {
        setSaving(false)
      }
    },
    [extended.activity, patchExtended, updateAvatar, user?.email],
  )

  const removeAvatar = useCallback(() => {
    if (!user?.email) return
    writeGeosyntraAccountProfile(user.email, { avatarDataUrl: undefined })
    updateAvatar({ avatarDataUrl: undefined })
  }, [updateAvatar, user?.email])

  const revokeOtherSessions = useCallback(() => {
    if (!user?.email) return
    const current = extended.sessions?.find(s => s.current) ?? extended.sessions?.[0]
    patchExtended({
      sessions: current ? [{ ...current, lastActive: new Date().toISOString() }] : [],
      activity: [
        {
          id: `act-${Date.now()}`,
          type: 'security',
          title: 'Sessions revoked',
          detail: 'Signed out of all other devices',
          at: new Date().toISOString(),
        },
        ...(extended.activity ?? []).slice(0, 12),
      ],
    })
  }, [extended.activity, extended.sessions, patchExtended, user?.email])

  return {
    user,
    logout,
    viewModel,
    avatarProfile,
    loading,
    saving,
    patchExtended,
    savePersonal,
    uploadAvatar,
    removeAvatar,
    revokeOtherSessions,
  }
}
