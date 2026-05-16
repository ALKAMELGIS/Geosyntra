import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../../lib/utils'
import type { ProviderId } from '../types'
import { CATEGORY_LABELS, PROVIDER_BY_CATEGORY, PROVIDER_REGISTRY } from '../providers/registry'

type Props = {
  value: ProviderId
  onChange: (id: ProviderId) => void
}

export function ProviderSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
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

  return (
    <div className="relative">
      <label className="api-integ-tw-label" htmlFor="provider-selector-trigger">
        Provider
      </label>
      <button
        id="provider-selector-trigger"
        type="button"
        className="api-integ-tw-input flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 items-center gap-2">
          <i className={cn(selected.iconClass, 'text-violet-400/90')} aria-hidden />
          <span className="truncate">{selected.label}</span>
        </span>
        <i className={cn('fa-solid fa-chevron-down text-xs text-white/40 transition', open && 'rotate-180')} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
              aria-label="Close provider list"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute left-0 right-0 z-[70] mt-1 max-h-72 overflow-hidden rounded-xl border border-white/10 bg-[rgba(12,14,20,0.96)] shadow-glass backdrop-blur-xl"
              role="listbox"
            >
              <div className="border-b border-white/10 p-2">
                <input
                  className="api-integ-tw-input w-full py-1.5 text-sm"
                  placeholder="Search providers…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1 si-scrollbar">
                {(Object.keys(filtered) as (keyof typeof filtered)[]).map(cat => {
                  const items = filtered[cat]
                  if (!items.length) return null
                  return (
                    <div key={cat} className="mb-1">
                      <p className="px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wider text-white/35">
                        {CATEGORY_LABELS[cat]}
                      </p>
                      {items.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={p.id === value}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-white/8',
                            p.id === value && 'bg-violet-500/15 text-violet-100',
                          )}
                          onClick={() => {
                            onChange(p.id)
                            setOpen(false)
                            setQuery('')
                          }}
                        >
                          <i className={cn(p.iconClass, 'mt-0.5 w-4 text-violet-400/80')} aria-hidden />
                          <span>
                            <span className="block font-medium">{p.label}</span>
                            <span className="block text-[0.68rem] text-white/40">{p.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
