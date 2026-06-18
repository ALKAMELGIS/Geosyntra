import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../lib/utils'
import './SiAoiWorkspaceSettingsPanel.css'

function formatRangeLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    if (!iso) return ''
    const d = new Date(`${iso}T12:00:00`)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const a = fmt(start)
  const b = fmt(end)
  if (a && b) return `${a} – ${b}`
  return a || b || '—'
}

function formatAreaShort(ha: number): string {
  if (!Number.isFinite(ha) || ha < 0) return '—'
  const haStr = ha >= 1000 ? ha.toFixed(1) : ha >= 100 ? ha.toFixed(2) : ha >= 1 ? ha.toFixed(2) : ha.toFixed(3)
  return `${haStr} ha`
}

export type SiAoiWorkspaceSettingsPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  areaHa: number
  areaDisplay: ReactNode
  dateStart: string
  dateEnd: string
  onDateStartChange: (value: string) => void
  onDateEndChange: (value: string) => void
  aoiId: string
  /** Workspace AOIs: layers picker removed — optional for other hosts only */
  layersOnCount?: number
  layersTotal?: number
  layersSlot?: ReactNode
}

export function SiAoiWorkspaceSettingsPanel({
  open,
  onOpenChange,
  areaHa,
  areaDisplay,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  layersOnCount,
  layersTotal,
  layersSlot,
  aoiId,
}: SiAoiWorkspaceSettingsPanelProps) {
  const layersSummary =
    layersSlot != null &&
    typeof layersOnCount === 'number' &&
    typeof layersTotal === 'number'
      ? ` · ${layersOnCount}/${layersTotal} layers`
      : ''
  const summary = `${formatAreaShort(areaHa)} · ${formatRangeLabel(dateStart, dateEnd)}${layersSummary}`

  return (
    <div className={cn('si-rs-aoi-settings', open && 'si-rs-aoi-settings--open')}>
      <button
        type="button"
        className="si-rs-aoi-settings__trigger"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className="si-rs-aoi-settings__trigger-icon" aria-hidden>
          <i className="fa-solid fa-sliders" />
        </span>
        <span className="si-rs-aoi-settings__trigger-text">
          <span className="si-rs-aoi-settings__trigger-title">Settings</span>
          <span className="si-rs-aoi-settings__trigger-meta">{summary}</span>
        </span>
        <i
          className={cn('fa-solid fa-chevron-down si-rs-aoi-settings__chev', open && 'si-rs-aoi-settings__chev--open')}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="si-rs-aoi-settings__panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="si-rs-aoi-settings__panel-inner">
              <div className="si-rs-aoi-settings__row si-rs-aoi-settings__row--area">
                <span className="si-rs-aoi-settings__k">Area</span>
                <div className="si-rs-aoi-settings__v si-rs-aoi-settings__v--area">{areaDisplay}</div>
              </div>

              <div className="si-rs-aoi-settings__row si-rs-aoi-settings__row--dates">
                <label className="si-rs-aoi-settings__field" htmlFor={`si-rs-settings-ts-${aoiId}`}>
                  <span className="si-rs-aoi-settings__k">Time start</span>
                  <input
                    id={`si-rs-settings-ts-${aoiId}`}
                    type="date"
                    className="si-rs-aoi-settings__input"
                    value={dateStart}
                    onChange={e => onDateStartChange(e.target.value)}
                  />
                </label>
                <label className="si-rs-aoi-settings__field" htmlFor={`si-rs-settings-te-${aoiId}`}>
                  <span className="si-rs-aoi-settings__k">Time end</span>
                  <input
                    id={`si-rs-settings-te-${aoiId}`}
                    type="date"
                    className="si-rs-aoi-settings__input"
                    value={dateEnd}
                    onChange={e => onDateEndChange(e.target.value)}
                  />
                </label>
              </div>

              {layersSlot ? <div className="si-rs-aoi-settings__layers">{layersSlot}</div> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
