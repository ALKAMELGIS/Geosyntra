import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../state/auth'
import { displayHeaderName } from '../../../lib/onboarding/localAuth'
import { readWorkspaceState } from '../../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../../lib/geoEnterpriseUserModel'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import { homeWizardSearch } from '../../../lib/homeWizardEntry'
import {
  accountProfileInitials,
  imageFileToAvatarDataUrl,
} from '../../../lib/account/geosyntraAccountProfile'
import { useGeosyntraAccountProfile } from './useGeosyntraAccountProfile'
import './home-profile.css'

export type HomeProfileSheetProps = {
  open: boolean
  onClose: () => void
}

export function HomeProfileSheet({ open, onClose }: HomeProfileSheetProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const fileInputId = useId()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { profile, updateProfile } = useGeosyntraAccountProfile(user?.email)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingSave, setPendingSave] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const displayName = user ? displayHeaderName(user) : ''
  const initials = accountProfileInitials(displayName || user?.email || 'U')
  const savedAvatar = profile.avatarDataUrl
  const shownAvatar = previewUrl ?? savedAvatar

  const ws = user ? readWorkspaceState(user.email) : null
  const planLabel = ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : '—'
  const workspaceLabel = ws?.workspaceReady
    ? ws.displayName?.trim() || ws.workspaceId || 'Workspace ready'
    : 'Setup in progress'

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      setPendingSave(false)
      setAvatarError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const onPickFile = useCallback(() => {
    setAvatarError(null)
    fileRef.current?.click()
  }, [])

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarError(null)
    try {
      const dataUrl = await imageFileToAvatarDataUrl(file)
      setPreviewUrl(dataUrl)
      setPendingSave(true)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not load image.')
    }
  }, [])

  const onSaveAvatar = useCallback(async () => {
    if (!previewUrl || !user?.email) return
    setSaving(true)
    try {
      updateProfile({ avatarDataUrl: previewUrl })
      setPendingSave(false)
      setPreviewUrl(null)
    } finally {
      setSaving(false)
    }
  }, [previewUrl, user?.email, updateProfile])

  const onRemoveAvatar = useCallback(() => {
    updateProfile({ avatarDataUrl: undefined })
    setPreviewUrl(null)
    setPendingSave(false)
    setAvatarError(null)
  }, [updateProfile])

  const onLogout = useCallback(() => {
    logout()
    onClose()
    navigate({
      pathname: SAAS_ROUTES.home,
      search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }),
    })
  }, [logout, onClose, navigate])

  if (!open || !user) return null

  return (
    <div className="home-profile-overlay" role="dialog" aria-modal="true" aria-labelledby="home-profile-title">
      <button type="button" className="home-profile-overlay__backdrop" aria-label="Close profile" onClick={onClose} />
      <article className="home-profile-sheet">
        <div className="home-profile-sheet__glow" aria-hidden />
        <header className="home-profile-sheet__head">
          <h2 id="home-profile-title" className="home-profile-sheet__title">
            Account profile
          </h2>
          <button type="button" className="home-profile-sheet__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <section className="home-profile-avatar-card" aria-label="Profile photo">
          <div className="home-profile-avatar-wrap">
            {shownAvatar ? (
              <img className="home-profile-avatar" src={shownAvatar} alt="" />
            ) : (
              <div className="home-profile-avatar home-profile-avatar--initials" aria-hidden>
                {initials}
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            id={fileInputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="visually-hidden"
            tabIndex={-1}
            onChange={onFileChange}
          />
          <div className="home-profile-avatar-actions">
            <button type="button" className="home-profile-avatar-btn" onClick={onPickFile}>
              {shownAvatar ? 'Change photo' : 'Upload photo'}
            </button>
            {pendingSave ? (
              <button
                type="button"
                className="home-profile-avatar-btn home-profile-avatar-btn--primary"
                disabled={saving}
                onClick={() => void onSaveAvatar()}
              >
                {saving ? 'Saving…' : 'Save photo'}
              </button>
            ) : null}
            {savedAvatar && !pendingSave ? (
              <button type="button" className="home-profile-avatar-btn" onClick={onRemoveAvatar}>
                Remove
              </button>
            ) : null}
          </div>
          <p className="home-profile-avatar-hint">JPG or PNG · max 2 MB · live preview before save</p>
          {avatarError ? <p className="home-profile-avatar-error">{avatarError}</p> : null}
        </section>

        <dl className="home-profile-fields">
          <div className="home-profile-field">
            <dt className="home-profile-field__k">Name</dt>
            <dd className="home-profile-field__v">{displayName || '—'}</dd>
          </div>
          <div className="home-profile-field">
            <dt className="home-profile-field__k">Email</dt>
            <dd className="home-profile-field__v home-profile-field__v--muted">{user.email}</dd>
          </div>
          <div className="home-profile-field">
            <dt className="home-profile-field__k">Subscription</dt>
            <dd className="home-profile-field__v">{planLabel}</dd>
          </div>
          <div className="home-profile-field">
            <dt className="home-profile-field__k">Workspace</dt>
            <dd className="home-profile-field__v">{workspaceLabel}</dd>
          </div>
        </dl>

        <footer className="home-profile-sheet__foot">
          <button type="button" className="home-profile-logout" onClick={onLogout}>
            <i className="fa-solid fa-right-from-bracket" aria-hidden /> Sign out
          </button>
        </footer>
      </article>
    </div>
  )
}
