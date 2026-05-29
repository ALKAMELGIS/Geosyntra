import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../../lib/utils'
import type { ProviderId } from '../types'
import { CATEGORY_LABELS, PROVIDER_BY_CATEGORY, PROVIDER_REGISTRY } from '../providers/registry'

type Props = {
  value: ProviderId
  onChange: (id: ProviderId) => void
}

export function ProviderSelector({ value, onChange }: Props) {
  const autoId = useId()
  const triggerId = `provider-selector-${autoId}`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = PROVIDER_REGISTRY[value]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PROVIDER_BY_CATEGORY
    const next: typeof PROVIDER_BY_CATEGORY = {
      gis: [],
      satellite: [],
      weather: [],
      ai: [],
      storage: [],
      database: [],
    }
    for (const cat of Object.keys(PROVIDER_BY_CATEGORY) as (keyof typeof PROVIDER_BY_CATEGORY)[]) {
      next[cat] = PROVIDER_BY_CATEGORY[cat].filter(
        p => p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      )
    }
    return next
  }, [query])

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
    <div ref={rootRef} className="api-integ-dd api-integ-dd--provider">
      <label className="api-integ-tw-label" htmlFor={triggerId}>
        Provider
      </label>
      <button
        id={triggerId}
        type="button"
        className={cn('api-integ-dd__trigger', open && 'api-integ-dd__trigger--open')}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
      >
        <span className="api-integ-dd__trigger-leading">
          <span className="api-integ-dd__icon-wrap" aria-hidden>
            <i className={selected.iconClass} />
          </span>
          <span className="api-integ-dd__trigger-value">{selected.label}</span>
        </span>
        <i className={cn('fa-solid fa-chevron-down api-integ-dd__chevron', open && 'api-integ-dd__chevron--open')} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="api-integ-dd__panel api-integ-dd__panel--provider"
            role="listbox"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="api-integ-dd__search-wrap">
              <i className="fa-solid fa-magnifying-glass api-integ-dd__search-icon" aria-hidden />
              <input
                className="api-integ-dd__search"
                placeholder="Search providers…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                aria-label="Search providers"
              />
            </div>
            <div className="api-integ-dd__scroll si-scrollbar">
              {(Object.keys(filtered) as (keyof typeof filtered)[]).map(cat => {
                const items = filtered[cat]
                if (!items.length) return null
                return (
                  <div key={cat} className="api-integ-dd__group">
                    <p className="api-integ-dd__group-label">{CATEGORY_LABELS[cat]}</p>
                    {items.map(p => {
                      const isSelected = p.id === value
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={cn(
                            'api-integ-dd__option api-integ-dd__option--rich',
                            isSelected && 'api-integ-dd__option--selected',
                          )}
                          onClick={() => {
                            onChange(p.id)
                            setOpen(false)
                            setQuery('')
                          }}
                        >
                          <span className="api-integ-dd__icon-wrap api-integ-dd__icon-wrap--sm" aria-hidden>
                            <i className={p.iconClass} />
                          </span>
                          <span className="api-integ-dd__option-body">
                            <span className="api-integ-dd__option-label">{p.label}</span>
                            <span className="api-integ-dd__option-desc">{p.description}</span>
                          </span>
                          {isSelected ? (
                            <i className="fa-solid fa-check api-integ-dd__option-check" aria-hidden />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
