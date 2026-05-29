import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Globe2, MapPin, Pencil, Settings, Share2, Sparkles } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { SAAS_ROUTES } from '../../../../lib/saasRoutes'
import type { ProfileViewModel } from '../../types'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileCover } from './ProfileCover'
import { UserBadges } from './UserBadges'
import './profile-premium.css'

export type PremiumProfileHeaderProps = {
  model: ProfileViewModel
  saving?: boolean
  onEditProfile: () => void
  onAvatarPick: (file: File) => void
  onAvatarMediaError?: () => void
  onCoverPick: (file: File) => void
  onCoverRemove: () => void
  onCoverMediaError?: () => void
  onCoverPositionChange: (y: number) => void
  onOpenSettings: () => void
  onShare?: () => void
  onUpgradePlan: () => void
}

export function ProfileHeader({
  model,
  saving,
  onEditProfile,
  onAvatarPick,
  onAvatarMediaError,
  onCoverPick,
  onCoverRemove,
  onCoverMediaError,
  onCoverPositionChange,
  onOpenSettings,
  onShare,
  onUpgradePlan,
}: PremiumProfileHeaderProps) {
  const sectionRef = useRef<HTMLElement>(null)

  const handleShare = () => {
    if (onShare) {
      onShare()
      return
    }
    const url = `${window.location.origin}${SAAS_ROUTES.accountProfile}`
    void navigator.clipboard?.writeText(url)
  }

  return (
    <section ref={sectionRef} className="profile-hero" aria-label="Profile header">
      <motion.div className="profile-hero__frame mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div className="profile-hero__card">
          <ProfileCover
            embedded
            className="profile-hero__cover"
            coverUrl={model.coverUrl}
            positionY={model.coverPositionY}
            saving={saving}
            onPick={onCoverPick}
            onRemove={onCoverRemove}
            onMediaError={onCoverMediaError}
            onPositionChange={onCoverPositionChange}
            scrollRef={sectionRef}
          />

          <motion.div
            className="profile-hero__body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="profile-hero__avatar-anchor">
              <ProfileAvatar
                variant="hero"
                fullName={model.fullName}
                avatarUrl={model.avatarUrl}
                saving={saving}
                onPick={onAvatarPick}
                onMediaError={onAvatarMediaError}
              />
            </div>

            <motion.div
              className="profile-hero__meta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.18 }}
            >
              <div className="profile-hero__meta-grid">
                <div className="profile-hero__identity">
                  <UserBadges model={model} className="profile-hero__badges" />

                  <h1 className="profile-hero__name">{model.fullName}</h1>
                  <p className="profile-hero__handle">@{model.username}</p>

                  <motion.div className="profile-hero__contact">
                    <span className="profile-hero__contact-item">
                      <Globe2 className="profile-hero__contact-icon" aria-hidden />
                      {model.workspaceLabel}
                    </span>
                    {model.country ? (
                      <span className="profile-hero__contact-item">
                        <MapPin className="profile-hero__contact-icon" aria-hidden />
                        {model.country}
                      </span>
                    ) : null}
                    <span className="profile-hero__contact-email">{model.email}</span>
                  </motion.div>
                </div>

                <aside className="profile-hero__aside" aria-label="Profile actions">
                  <motion.div className="profile-hero__progress" aria-label="Profile completeness">
                    <div className="profile-hero__progress-head">
                      <span>Profile completeness</span>
                      <strong>{model.completenessPercent}%</strong>
                    </div>
                    <div className="profile-hero__progress-track">
                      <motion.div
                        className="profile-hero__progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${model.completenessPercent}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    {model.completenessMissing.length > 0 ? (
                      <p className="profile-hero__progress-hint">
                        Add: {model.completenessMissing.join(' · ')}
                      </p>
                    ) : (
                      <p className="profile-hero__progress-hint profile-hero__progress-hint--ok">
                        Your profile is complete.
                      </p>
                    )}
                  </motion.div>

                  <div className="profile-hero__actions">
                    <HeaderAction primary onClick={onEditProfile} icon={<Pencil className="h-4 w-4" />}>
                      Edit profile
                    </HeaderAction>
                    <HeaderAction onClick={handleShare} icon={<Share2 className="h-4 w-4" />}>
                      Share
                    </HeaderAction>
                    <HeaderAction onClick={onUpgradePlan} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
                      Upgrade plan
                    </HeaderAction>
                    <HeaderAction onClick={onOpenSettings} icon={<Settings className="h-4 w-4" />}>
                      Settings
                    </HeaderAction>
                  </div>
                </aside>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  )
}

function actionClass(primary?: boolean) {
  return cn(
    'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition',
    primary
      ? 'border-white/20 bg-white text-[#07080c] shadow-lg shadow-black/30 hover:bg-zinc-100'
      : 'border-white/12 bg-white/5 text-zinc-200 backdrop-blur-md hover:border-white/20 hover:bg-white/10 hover:text-white',
  )
}

function HeaderAction({
  children,
  icon,
  onClick,
  primary,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className={actionClass(primary)}>
      {icon}
      {children}
    </button>
  )
}
