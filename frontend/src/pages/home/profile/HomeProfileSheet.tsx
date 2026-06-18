import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../state/auth'
import { displayHeaderName } from '../../../lib/onboarding/localAuth'
import { readWorkspaceState } from '../../../lib/onboarding/workspaceState'
import { SUBSCRIPTION_PLAN_LABELS } from '../../../lib/geoEnterpriseUserModel'
import { getAdminUserByEmail } from '../../../lib/admin/adminUserStore'
import { SAAS_ROUTES } from '../../../lib/saasRoutes'
import { navigateToHomeWizard } from '../../../lib/homeWizardEntry'
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

function formatUpdated(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    )
  } catch {
    return iso
  }
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
  const directory = user ? getAdminUserByEmail(user.email) : null
  const emailVerified = directory?.emailVerified ?? true
  const planLabel = ws ? SUBSCRIPTION_PLAN_LABELS[ws.subscriptionPlan] : directory?.plan ?? 'Trial'
  const workspaceLabel = ws?.workspaceReady
    ? ws.displayName?.trim() || ws.workspaceId || 'Workspace ready'
    : 'Setup in progress'
  const roleLabel = String(user?.role ?? 'Viewer')
  const lastUpdated = formatUpdated(profile.updatedAt ?? directory?.lastLogin)

  const completeness = (() => {
    const checks = [
      Boolean(shownAvatar),
      Boolean(displayName.trim()),
      emailVerified,
      Boolean(ws?.workspaceReady),
    ]
    const done = checks.filter(Boolean).length
    return Math.round((done / checks.length) * 100)
  })()

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      setPendingSave(false)
      setAvatarError(null)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
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
    navigateToHomeWizard(navigate, { wizard: 'auth', authMode: 'signin' })
  }, [logout, onClose, navigate])

  if (!open || !user) return null

  return (
    <div className="home-profile-overlay" role="dialog" aria-modal="true" aria-labelledby="home-profile-title">
      <div className="home-profile-overlay__glow" aria-hidden />
      <button type="button" className="home-profile-overlay__backdrop" aria-label="Close profile" onClick={onClose} />
      <article className="home-profile-sheet">
        <header className="home-profile-sheet__head">
          <div>
            <p className="home-profile-sheet__eyebrow">GeoSyntra Account</p>
            <h2 id="home-profile-title" className="home-profile-sheet__title">
              Profile
            </h2>
          </div>
          <button type="button" className="home-profile-sheet__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        {!emailVerified ? (
          <div className="home-profile-sheet__banner" role="status">
            <i className="fa-solid fa-envelope-circle-check" aria-hidden />
            <div>
              <p className="home-profile-sheet__banner-title">Verify your email</p>
              <p className="home-profile-sheet__banner-text">{user.email}</p>
            </div>
            <Link
              to={{
                pathname: SAAS_ROUTES.authVerifyEmail,
                search: `?email=${encodeURIComponent(user.email)}`,
              }}
              className="home-profile-sheet__banner-cta"
              onClick={onClose}
            >
              Verify
            </Link>
          </div>
        ) : null}

        <section className="home-profile-sheet__hero" aria-label="Profile summary">
          <button type="button" className="home-profile-sheet__avatar-btn" onClick={onPickFile} title="Change photo">
            {shownAvatar ? (
              <img className="home-profile-sheet__avatar" src={shownAvatar} alt="" />
            ) : (
              <span className="home-profile-sheet__avatar home-profile-sheet__avatar--initials" aria-hidden>
                {initials}
              </span>
            )}
            <span className="home-profile-sheet__avatar-edit" aria-hidden>
              <i className="fa-solid fa-camera" />
            </span>
          </button>
          <div className="home-profile-sheet__hero-copy">
            <p className="home-profile-sheet__display-name">{displayName || '—'}</p>
            <p className="home-profile-sheet__email">{user.email}</p>
            <div className="home-profile-sheet__badges">
              <span className="home-profile-sheet__badge">{roleLabel}</span>
              <span className="home-profile-sheet__badge home-profile-sheet__badge--plan">{planLabel}</span>
              {emailVerified ? (
                <span className="home-profile-sheet__badge home-profile-sheet__badge--ok">Verified</span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="home-profile-sheet__progress" aria-label="Profile completeness">
          <div className="home-profile-sheet__progress-head">
            <span>Profile completeness</span>
            <span>{completeness}%</span>
          </div>
          <div className="home-profile-sheet__progress-track">
            <span className="home-profile-sheet__progress-fill" style={{ width: `${completeness}%` }} />
          </div>
          <p className="home-profile-sheet__updated">Last updated · {lastUpdated}</p>
        </div>

        <div className="home-profile-sheet__scroll">
          <input
            ref={fileRef}
            id={fileInputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="visually-hidden"
            tabIndex={-1}
            onChange={onFileChange}
          />
          {(pendingSave || savedAvatar) && (
            <div className="home-profile-sheet__photo-actions">
              {pendingSave ? (
                <button
                  type="button"
                  className="home-profile-sheet__btn home-profile-sheet__btn--primary"
                  disabled={saving}
                  onClick={() => void onSaveAvatar()}
                >
                  {saving ? 'Saving…' : 'Save photo'}
                </button>
              ) : null}
              {savedAvatar && !pendingSave ? (
                <button type="button" className="home-profile-sheet__btn" onClick={onRemoveAvatar}>
                  Remove photo
                </button>
              ) : null}
            </div>
          )}
          {avatarError ? <p className="home-profile-sheet__error">{avatarError}</p> : null}

          <div className="home-profile-sheet__grid">
            <div className="home-profile-sheet__cell">
              <span className="home-profile-sheet__cell-k">Name</span>
              <span className="home-profile-sheet__cell-v">{displayName || '—'}</span>
            </div>
            <div className="home-profile-sheet__cell">
              <span className="home-profile-sheet__cell-k">Email</span>
              <span className="home-profile-sheet__cell-v home-profile-sheet__cell-v--muted">{user.email}</span>
            </div>
            <div className="home-profile-sheet__cell">
              <span className="home-profile-sheet__cell-k">Subscription</span>
              <span className="home-profile-sheet__cell-v">{planLabel}</span>
            </div>
            <div className="home-profile-sheet__cell">
              <span className="home-profile-sheet__cell-k">Workspace</span>
              <span className="home-profile-sheet__cell-v">{workspaceLabel}</span>
            </div>
          </div>
        </div>

        <footer className="home-profile-sheet__foot">
          <Link to={SAAS_ROUTES.accountProfile} className="home-profile-sheet__btn home-profile-sheet__btn--gold" onClick={onClose}>
            Open full profile
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
          </Link>
          <button type="button" className="home-profile-sheet__btn home-profile-sheet__btn--danger" onClick={onLogout}>
            <i className="fa-solid fa-right-from-bracket" aria-hidden /> Sign Out
          </button>
        </footer>
      </article>
    </div>
  )
}
