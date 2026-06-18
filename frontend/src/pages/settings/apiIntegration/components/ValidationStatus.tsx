import { cn } from '../../../../lib/utils'
import type { FieldValidation, ValidationLevel } from '../types'

const ICON: Record<ValidationLevel, string> = {
  success: 'fa-circle-check text-emerald-400',
  warning: 'fa-triangle-exclamation text-amber-400',
  error: 'fa-circle-xmark text-red-400',
  idle: '',
}

export function ValidationStatus({ validation, className }: { validation: FieldValidation; className?: string }) {
  if (validation.level === 'idle' || !validation.message) return null
  return (
    <p className={cn('mt-1 flex items-center gap-1.5 text-[0.7rem]', className)}>
      <i className={cn('fa-solid text-[0.65rem]', ICON[validation.level])} aria-hidden />
      <span
        className={cn(
          validation.level === 'success' && 'text-emerald-400/90',
          validation.level === 'warning' && 'text-amber-400/90',
          validation.level === 'error' && 'text-red-400/90',
        )}
      >
        {validation.message}
      </span>
    </p>
  )
}
