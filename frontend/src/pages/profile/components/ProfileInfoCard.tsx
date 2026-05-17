import { Pencil } from 'lucide-react'
import { cn } from '../../../lib/utils'

type ProfileInfoCardProps = {
  label: string
  value: string
  icon?: React.ReactNode
  onEdit?: () => void
  className?: string
}

export function ProfileInfoCard({ label, value, icon, onEdit, className }: ProfileInfoCardProps) {
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/12 bg-card/25 p-4 shadow-sm backdrop-blur-xl transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-black/20',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate text-sm font-medium text-card-foreground">{value || '—'}</p>
        </div>
        {icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition hover:border-border hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </article>
  )
}
