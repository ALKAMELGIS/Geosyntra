import type { ReactNode } from 'react'
import { cn } from '../../../../lib/utils'

type Props = {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}

export function FormSection({ title, subtitle, children, className }: Props) {
  return (
    <section className={cn('mb-5', className)}>
      <div className="mb-3 border-b border-white/10 pb-2">
        <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/50">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-white/40">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}
