import { BadgeCheck, Crown, Shield } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { ProfileViewModel } from '../../types'

type UserBadgesProps = {
  model: ProfileViewModel
  className?: string
}

const STATUS_STYLES = {
  Active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  Pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  Suspended: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
} as const

export function UserBadges({ model, className }: UserBadgesProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-md',
          STATUS_STYLES[model.status],
        )}
      >
        <Shield className="h-3 w-3" aria-hidden />
        {model.role}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 backdrop-blur-md">
        <Crown className="h-3 w-3 text-amber-300/90" aria-hidden />
        {model.planLabel}
      </span>
      {model.emailVerified ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-200 backdrop-blur-md">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          Verified
        </span>
      ) : null}
    </div>
  )
}
