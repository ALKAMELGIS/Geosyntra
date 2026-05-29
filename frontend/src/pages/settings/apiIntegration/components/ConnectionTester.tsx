import { cn } from '../../../../lib/utils'

type Props = {
  testing: boolean
  disabled: boolean
  onTest: () => void
}

export function ConnectionTester({ testing, disabled, onTest }: Props) {
  return (
    <button
      type="button"
      className={cn(
        'api-integ-btn api-integ-btn--ghost inline-flex items-center gap-2',
        testing && 'opacity-70',
      )}
      disabled={disabled || testing}
      onClick={onTest}
    >
      <i className={cn('fa-solid', testing ? 'fa-spinner fa-spin' : 'fa-play')} aria-hidden />
      {testing ? 'Testing…' : 'Test connection'}
    </button>
  )
}
