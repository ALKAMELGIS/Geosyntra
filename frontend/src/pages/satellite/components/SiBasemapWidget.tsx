import type { BasemapCatalogEntry } from '../basemapCatalog'
import {
  catalogEntryById,
  getBasemapThumbnail,
  resolveBasemapId,
} from '../basemapCatalog'
import { SI_QUICK_BASEMAP_PRESETS } from '../utils/siMapBasemapRuntime'
import './SiBasemapWidget.css'

export type SiBasemapWidgetProps = {
  basemapCatalog: BasemapCatalogEntry[]
  basemapRasterEntries: BasemapCatalogEntry[]
  basemap3dEntries: BasemapCatalogEntry[]
  activeBasemapId: string
  mapboxToken: string
  onSelectBasemap: (id: string) => void
  onClose: () => void
}

function isHybridBasemap(entry: BasemapCatalogEntry): boolean {
  return entry.id === 'esri-imagery-hybrid'
}

type BasemapRowProps = {
  entry: BasemapCatalogEntry
  active: boolean
  mapboxToken: string
  onSelect: () => void
}

function SiBasemapRow({ entry, active, mapboxToken, onSelect }: BasemapRowProps) {
  const thumb = getBasemapThumbnail(entry, mapboxToken)
  const hybrid = isHybridBasemap(entry)

  return (
    <button
      type="button"
      className={`si-basemap-row${active ? ' si-basemap-row--active' : ''}`}
      role="option"
      aria-selected={active}
      title={entry.label}
      onClick={e => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <span className="si-basemap-row__thumb">
        <img src={thumb} alt="" loading="lazy" decoding="async" />
        {hybrid ? <span className="si-basemap-row__hybrid">Labels</span> : null}
      </span>
      <span className="si-basemap-row__meta">
        <span className="si-basemap-row__label">{entry.label}</span>
        {entry.badges?.length ? (
          <span className="si-basemap-row__badges">
            {entry.badges.map(badge => (
              <span key={badge} className="si-basemap-row__badge">
                {badge}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function SiBasemapWidget({
  basemapCatalog,
  basemapRasterEntries,
  basemap3dEntries,
  activeBasemapId,
  mapboxToken,
  onSelectBasemap,
  onClose,
}: SiBasemapWidgetProps) {
  return (
    <div
      className="si-basemap-widget si-basemap-widget--esri si-basemap-widget--dropdown"
      role="listbox"
      aria-label="Basemap gallery"
    >
      <div className="si-basemap-widget__header">
        <span className="si-basemap-widget__title">Basemap</span>
        <button
          type="button"
          className="si-basemap-widget__close"
          aria-label="Close basemap gallery"
          onClick={e => {
            e.stopPropagation()
            onClose()
          }}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-basemap-widget__body">
        <div className="si-basemap-quick" role="group" aria-label="Quick basemaps">
          {SI_QUICK_BASEMAP_PRESETS.map(preset => {
            const entry =
              catalogEntryById(basemapCatalog, resolveBasemapId(preset.catalogId)) ??
              catalogEntryById(basemapCatalog, preset.catalogId)
            const active =
              activeBasemapId === preset.catalogId ||
              activeBasemapId === resolveBasemapId(preset.catalogId)
            return (
              <button
                key={preset.key}
                type="button"
                className={`si-basemap-quick-btn${active ? ' si-basemap-quick-btn--active' : ''}`}
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={active}
                onClick={e => {
                  e.stopPropagation()
                  onSelectBasemap(preset.catalogId)
                }}
              >
                <i className={preset.icon} aria-hidden />
              </button>
            )
          })}
        </div>

        <div className="si-basemap-section si-basemap-section--flat">
          <div className="si-basemap-section__label">All basemaps</div>
          <div className="si-basemap-section__list">
            {basemapRasterEntries.map(entry => (
              <SiBasemapRow
                key={entry.id}
                entry={entry}
                active={activeBasemapId === entry.id}
                mapboxToken={mapboxToken}
                onSelect={() => onSelectBasemap(entry.id)}
              />
            ))}
          </div>
        </div>

        {basemap3dEntries.length ? (
          <div className="si-basemap-section si-basemap-section--flat">
            <div className="si-basemap-section__label">3D basemaps</div>
            <div className="si-basemap-section__list">
              {basemap3dEntries.map(entry => (
                <SiBasemapRow
                  key={entry.id}
                  entry={entry}
                  active={activeBasemapId === entry.id}
                  mapboxToken={mapboxToken}
                  onSelect={() => onSelectBasemap(entry.id)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
