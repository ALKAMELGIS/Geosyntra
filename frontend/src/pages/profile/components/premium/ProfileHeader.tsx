import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Globe2, MapPin, Pencil, Settings, Share2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../../../lib/utils'
import { SAAS_ROUTES } from '../../../../lib/saasRoutes'
import type { ProfileViewModel } from '../../types'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileCover } from './ProfileCover'
import { UserBadges } from './UserBadges'

export type PremiumProfileHeaderProps = {
  model: ProfileViewModel
  saving?: boolean
  onEditProfile: () => void
  onAvatarPick: (file: File) => void
  onCoverPick: (file: File) => void
  onCoverRemove: () => void
  onCoverPositionChange: (y: number) => void
  onOpenSettings: () => void
  onShare?: () => void
}

export function ProfileHeader({
  model,
  saving,
  onEditProfile,
  onAvatarPick,
  onCoverPick,
  onCoverRemove,
  onCoverPositionChange,
  onOpenSettings,
  onShare,
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
    <section ref={sectionRef} className="relative mb-8" aria-label="Profile header">
      <ProfileCover
        coverUrl={model.coverUrl}
        positionY={model.coverPositionY}
        saving={saving}
        onPick={onCoverPick}
        onRemove={onCoverRemove}
        onPositionChange={onCoverPositionChange}
        scrollRef={sectionRef}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:gap-8">
          <ProfileAvatar
            className="-mt-14 self-center md:-mt-[4.5rem] md:self-auto"
            fullName={model.fullName}
            avatarUrl={model.avatarUrl}
            saving={saving}
            onPick={onAvatarPick}
          />

          <motion.div
            className="min-w-0 flex-1 pb-1 text-center md:text-left"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
          >
            <UserBadges model={model} className="mb-3 justify-center md:justify-start" />

            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{model.fullName}</h1>
            <p className="mt-1 text-sm text-zinc-400">@{model.username}</p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-400 md:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                {model.workspaceLabel}
              </span>
              {model.country ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  {model.country}
                </span>
              ) : null}
              <span className="text-zinc-500">{model.email}</span>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <HeaderAction primary onClick={onEditProfile} icon={<Pencil className="h-4 w-4" />}>
                Edit profile
              </HeaderAction>
              <HeaderAction onClick={handleShare} icon={<Share2 className="h-4 w-4" />}>
                Share
              </HeaderAction>
              <Link
                to={SAAS_ROUTES.billingPricing}
                className={actionClass(false)}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Upgrade plan
              </Link>
              <HeaderAction onClick={onOpenSettings} icon={<Settings className="h-4 w-4" />}>
                Settings
              </HeaderAction>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-400">Profile completeness</span>
                <span className="font-semibold text-white">{model.completenessPercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-zinc-300 via-white to-zinc-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${model.completenessPercent}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              {model.completenessMissing.length > 0 ? (
                <p className="mt-2 text-[11px] text-zinc-500">Add: {model.completenessMissing.join(' · ')}</p>
              ) : (
                <p className="mt-2 text-[11px] text-emerald-400/90">Your profile is complete.</p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
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
