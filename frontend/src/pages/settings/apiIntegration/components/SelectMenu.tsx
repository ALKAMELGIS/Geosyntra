import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../../lib/utils'

export type SelectMenuOption = {
  value: string
  label: string
}

type Props = {
  label: string
  value: string
  options: SelectMenuOption[]
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
}

export function SelectMenu({ label, value, options, onChange, id, disabled }: Props) {
  const autoId = useId()
  const triggerId = id ?? `select-menu-${autoId}`
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="api-integ-dd">
      <label className="api-integ-tw-label" htmlFor={triggerId}>
        {label}
      </label>
      <button
        id={triggerId}
        type="button"
        className={cn('api-integ-dd__trigger', open && 'api-integ-dd__trigger--open')}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen(o => !o)}
      >
        <span className="api-integ-dd__trigger-value">{selected?.label ?? '—'}</span>
        <i className={cn('fa-solid fa-chevron-down api-integ-dd__chevron', open && 'api-integ-dd__chevron--open')} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="api-integ-dd__panel api-integ-dd__panel--compact"
            role="listbox"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {options.map(o => {
              const isSelected = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn('api-integ-dd__option', isSelected && 'api-integ-dd__option--selected')}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <span className="api-integ-dd__option-label">{o.label}</span>
                  {isSelected ? <i className="fa-solid fa-check api-integ-dd__option-check" aria-hidden /> : null}
                </button>
              )
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
