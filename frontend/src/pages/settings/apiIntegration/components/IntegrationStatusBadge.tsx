import { motion } from 'framer-motion'
import { cn } from '../../../../lib/utils'
import type { IntegrationStatus } from '../types'

const LABEL: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  expired: 'Expired',
  invalid: 'Invalid',
  pending: 'Pending',
  testing: 'Testing…',
  rate_limited: 'Rate limited',
}

const DOT: Record<IntegrationStatus, string> = {
  connected: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
  disconnected: 'bg-zinc-500',
  expired: 'bg-amber-400',
  invalid: 'bg-red-400',
  pending: 'bg-zinc-400',
  testing: 'bg-sky-400 animate-pulse',
  rate_limited: 'bg-orange-400',
}

export function IntegrationStatusBadge({ status, className }: { status: IntegrationStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.7rem] font-medium text-white/80',
        className,
      )}
    >
      <motion.span
        className={cn('h-2 w-2 rounded-full', DOT[status])}
        animate={status === 'testing' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
        transition={{ repeat: status === 'testing' ? Infinity : 0, duration: 1 }}
      />
      {LABEL[status]}
    </span>
  )
}
