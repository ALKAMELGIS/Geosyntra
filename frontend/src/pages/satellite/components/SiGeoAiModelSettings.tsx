import { useEffect, useRef, useState } from 'react'
import './siGeoAiModelSettings.css'

export type GeoAiModelTab = 'gemini' | 'claude' | 'deepseek'

export type SiGeoAiModelSettingsProps = {
  value: GeoAiModelTab
  onChange: (tab: GeoAiModelTab) => void
}

export function SiGeoAiModelSettings({ value, onChange }: SiGeoAiModelSettingsProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="si-geo-ai-model-settings">
      <button
        type="button"
        className="si-geo-explorer-icon-btn si-geo-ai-model-settings-trigger"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Agent settings — model"
      >
        <i className="fa-solid fa-sliders" aria-hidden />
        <span className="si-geo-ai-float-sr-only">Agent settings</span>
      </button>
      {open ? (
        <div className="si-geo-ai-model-settings-pop" role="group" aria-label="AI model">
          <p className="si-geo-ai-model-settings-label">Model</p>
          <div className="si-geo-ai-model-settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={value === 'gemini'}
              className={`si-geo-ai-model-settings-tab${value === 'gemini' ? ' si-geo-ai-model-settings-tab--active' : ''}`}
              title="Gemini — map & imagery"
              onClick={() => {
                onChange('gemini')
                setOpen(false)
              }}
            >
              <i className="fa-brands fa-google" aria-hidden />
              <span>Gemini</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={value === 'claude'}
              className={`si-geo-ai-model-settings-tab${value === 'claude' ? ' si-geo-ai-model-settings-tab--active' : ''}`}
              title="Claude — GIS data"
              onClick={() => {
                onChange('claude')
                setOpen(false)
              }}
            >
              <i className="fa-solid fa-feather-pointed" aria-hidden />
              <span>Claude</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={value === 'deepseek'}
              className={`si-geo-ai-model-settings-tab${value === 'deepseek' ? ' si-geo-ai-model-settings-tab--active' : ''}`}
              title="DeepSeek — GIS data"
              onClick={() => {
                onChange('deepseek')
                setOpen(false)
              }}
            >
              <i className="fa-solid fa-bolt" aria-hidden />
              <span>DeepSeek</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
