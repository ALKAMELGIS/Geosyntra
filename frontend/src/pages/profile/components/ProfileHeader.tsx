import { useRef } from 'react'
import {
  BadgeCheck,
  Camera,
  Circle,
  Mail,
  Pencil,
  Shield,
} from 'lucide-react'
import { accountProfileInitials } from '../../../lib/account/geosyntraAccountProfile'
import { cn } from '../../../lib/utils'
import { formatProfileDate } from '../profileUtils'
import type { ProfileViewModel } from '../types'

type ProfileHeaderProps = {
  model: ProfileViewModel
  saving: boolean
  onEditProfile: () => void
  onAvatarPick: (file: File) => void
  onAvatarRemove: () => void
}

const STATUS_STYLES = {
  Active: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Pending: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
  Suspended: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
} as const

export function ProfileHeader({ model, saving, onEditProfile, onAvatarPick, onAvatarRemove }: ProfileHeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const initials = accountProfileInitials(model.fullName)

  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/15 bg-card/30 p-6 shadow-glass backdrop-blur-2xl md:p-8">
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="relative">
            <div className="rounded-full bg-gradient-to-br from-primary/40 via-muted/30 to-accent/30 p-[3px] shadow-lg">
              {model.avatarUrl ? (
                <img
                  src={model.avatarUrl}
                  alt=""
                  className="h-24 w-24 rounded-full border border-border/60 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-border/60 bg-muted text-lg font-semibold text-foreground">
                  {initials}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:bg-muted"
              aria-label="Upload profile photo"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onAvatarPick(file)
              }}
            />
          </div>

          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Account</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{model.fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/60">
                <Shield className="h-3 w-3" aria-hidden />
                {model.role}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                  STATUS_STYLES[model.status],
                )}
              >
                <Circle className="h-2 w-2 fill-current" aria-hidden />
                {model.status}
              </span>
              {model.emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 ring-1 ring-sky-500/25">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  Verified
                </span>
              ) : null}
            </div>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start">
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {model.email}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Last updated {formatProfileDate(model.lastUpdatedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
          <button
            type="button"
            onClick={onEditProfile}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit profile
          </button>
          {model.avatarUrl ? (
            <button
              type="button"
              disabled={saving}
              onClick={onAvatarRemove}
              className="text-center text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative mt-6">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Profile completeness</span>
          <span className="font-semibold text-foreground">{model.completenessPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-accent/80 transition-all duration-500"
            style={{ width: `${model.completenessPercent}%` }}
          />
        </div>
        {model.completenessMissing.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Add: {model.completenessMissing.join(' · ')}
          </p>
        ) : (
          <p className="mt-2 text-xs text-emerald-300/90">Your profile is complete.</p>
        )}
      </div>
    </header>
  )
}
