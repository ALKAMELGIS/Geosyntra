/**
 * Geosyntra · Fields Data panel — OneSoil-style.
 *
 * Architecture
 * ------------
 * Pure presentation. All field state (CRUD + selection) is owned by
 * the host page (`GisMap.tsx` or `SatelliteIntelligence.tsx`) so the
 * panel can be remounted without losing data and so the Saved Fields
 * map layer reads from the exact same source of truth.
 *
 * Layout (post-redesign · no top-of-panel "Fields Data" lede)
 * ------------------------------------------------------------
 *   1. Drawing module — horizontal Glass toolbar (Polygon / Rectangle /
 *                       Circle / Edit / Delete / Save) — fully isolated
 *                       from the Remote Sensing toolbar.
 *   2. Primary CTA    — "Add Draw New Field" arms the map with the
 *                       currently-selected shape from (1).
 *   3. Search + chips — name/crop filter + count + total area.
 *   4. Empty state    — friendly hint when no fields exist.
 *   5. Field list     — scrollable, OneSoil-style card per field.
 *   6. Detail card    — pinned to the bottom when a field is selected,
 *                       shows area / crop / NDVI placeholders / linked
 *                       satellite layer / actions.
 *
 * The header strip (icon + "Fields Data" + lede) was deliberately
 * removed in this revision per the redesign brief — the freed
 * vertical space now hosts the drawing module so the user can stay
 * inside the panel for the entire draw → save → analyse loop.
 */

import { useMemo, useState } from 'react'
import GsIcon from '../../../../components/ui/GsIcon'
import { appConfirm } from '../../../../lib/appDialog'
import FieldDrawingModule, { type FieldDrawShape } from './FieldDrawingModule'
import {
  CROP_PRESETS,
  formatArea,
  formatShortDate,
  type SavedField,
} from './fieldsStore'

interface FieldsPanelProps {
  fields: SavedField[]
  selectedId: string | null
  onSelectField: (id: string | null) => void
  onZoomToField: (id: string) => void
  onUpdateField: (id: string, patch: Partial<Pick<SavedField, 'name' | 'crop' | 'notes' | 'color'>>) => void
  onDeleteField: (id: string) => void
  onExportFieldGeoJSON: (id: string) => void
  onExportAllGeoJSON: () => void
  /** Arm the map's drawing pipeline with the given shape. The host
   *  is responsible for routing this to its underlying draw layer
   *  (Mapbox handlers / Leaflet-Draw) so Fields and Remote Sensing
   *  stay isolated above this boundary. */
  onStartDrawing: (shape: FieldDrawShape) => void
  /** Re-arm the draw pipeline in "edit existing" mode for the
   *  currently selected field. */
  onEditSelected?: () => void
  /** Commit / lock-in the in-flight draft (no-op when the host
   *  already auto-saves on geometry close). */
  onSaveDraft?: () => void
  /** True when the parent has the active drawing tool armed. Lets the
   *  module render the "armed" pulse on the active shape and the CTA
   *  show its in-progress copy. */
  drawingArmed: boolean
}

export default function FieldsPanel({
  fields,
  selectedId,
  onSelectField,
  onZoomToField,
  onUpdateField,
  onDeleteField,
  onExportFieldGeoJSON,
  onExportAllGeoJSON,
  onStartDrawing,
  onEditSelected,
  onSaveDraft,
  drawingArmed,
}: FieldsPanelProps) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  /* Selected drawing shape for the next "Add Draw New Field" press.
   * Owned here (not in the host) so the toolbar stays self-contained
   * and never fights the Remote Sensing draw mode for the same key
   * in parent state. */
  const [activeShape, setActiveShape] = useState<FieldDrawShape>('polygon')

  const filteredFields = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fields
    return fields.filter(f => {
      const haystack = `${f.name} ${f.crop ?? ''} ${f.notes ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [fields, query])

  const selectedField = useMemo(
    () => (selectedId ? fields.find(f => f.id === selectedId) ?? null : null),
    [fields, selectedId],
  )

  const totalArea = useMemo(
    () => fields.reduce((sum, f) => sum + (Number.isFinite(f.areaHectares) ? f.areaHectares : 0), 0),
    [fields],
  )

  /* Submit a rename — keep the new name unique-ish by trimming + falling
   * back to the previous name if the user empties the input. */
  const commitRename = (id: string) => {
    const next = editingName.trim()
    if (next.length > 0) {
      const previous = fields.find(f => f.id === id)
      if (!previous || previous.name !== next) {
        onUpdateField(id, { name: next })
      }
    }
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div className="gs-fields-panel gs-fields-panel--no-header gis-map-tool-surface">
      {/* Self-contained drawing module — fully isolated from the
          Remote Sensing toolbar. Owns its own shape selection state
          and routes user intent through the two callback props. */}
      <FieldDrawingModule
        activeShape={activeShape}
        isDrawingArmed={drawingArmed}
        hasSelection={Boolean(selectedId)}
        onSelectShape={shape => setActiveShape(shape)}
        onEdit={() => onEditSelected?.()}
        onDelete={() => {
          if (!selectedId) return
          const target = fields.find(f => f.id === selectedId)
          if (!target) return
          void appConfirm(
            `The field "${target.name}", its boundary, and any saved metadata will be permanently removed.`,
            {
              title: 'Delete this field?',
              confirmLabel: 'Delete field',
              cancelLabel: 'Keep it',
              danger: true,
            },
          ).then(ok => {
            if (ok) onDeleteField(target.id)
          })
        }}
        onSave={() => onSaveDraft?.()}
      />

      {/* Primary CTA — arms the host map's drawing pipeline with the
          shape currently selected in the module above. Disabled while
          a sketch is in flight so users can't double-arm. */}
      <button
        type="button"
        className="gs-fields-cta"
        onClick={() => onStartDrawing(activeShape)}
        disabled={drawingArmed}
        title={
          drawingArmed
            ? 'Finish the current sketch first'
            : `Draw a ${activeShape} on the map and save it as a new field`
        }
      >
        <GsIcon name="plus" size={16} />
        <span>
          {drawingArmed
            ? 'Finish current sketch on the map…'
            : 'Add Draw New Field'}
        </span>
      </button>

      {/* Search + summary strip — total area helps the user grok scale at a
          glance without opening every card. */}
      <div className="gs-fields-summary">
        <label className="gs-fields-search">
          <GsIcon name="search" size={14} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search fields by name or crop"
            aria-label="Search fields"
          />
          {query && (
            <button
              type="button"
              className="gs-fields-search__clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <GsIcon name="x" size={12} />
            </button>
          )}
        </label>
        <div className="gs-fields-summary__chips">
          <span className="gs-fields-chip">
            <strong>{fields.length}</strong> field{fields.length === 1 ? '' : 's'}
          </span>
          {fields.length > 0 && <span className="gs-fields-chip gs-fields-chip--muted">{formatArea(totalArea)} total</span>}
        </div>
      </div>

      {/* Empty state — fires when the user has saved nothing yet, OR when
          search filters out every card. We split the two so the messaging
          matches the cause. */}
      {fields.length === 0 ? (
        <div className="gs-fields-empty">
          <div className="gs-fields-empty__icon" aria-hidden="true">
            <GsIcon name="map-pin" size={28} />
          </div>
          <h4 className="gs-fields-empty__title">No fields saved yet</h4>
          <p className="gs-fields-empty__copy">
            Use the drawing tools (polygon, rectangle, or circle) to sketch an area on the map. Each AOI you finish is
            saved here automatically as a Field — with its area, date, and a slot for crop / NDVI metadata.
          </p>
        </div>
      ) : filteredFields.length === 0 ? (
        <div className="gs-fields-empty gs-fields-empty--filtered">
          <p className="gs-fields-empty__copy">No fields match “{query}”.</p>
        </div>
      ) : (
        <ul className="gs-fields-list" role="list" aria-label="Saved fields">
          {filteredFields.map(field => {
            const isSelected = field.id === selectedId
            const isRenaming = editingId === field.id
            return (
              <li
                key={field.id}
                className={['gs-field-card', isSelected ? 'gs-field-card--selected' : ''].filter(Boolean).join(' ')}
                style={{ ['--field-color' as keyof React.CSSProperties as string]: field.color } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="gs-field-card__body"
                  onClick={() => {
                    onSelectField(field.id)
                    onZoomToField(field.id)
                  }}
                >
                  <span className="gs-field-card__swatch" aria-hidden="true" />
                  <span className="gs-field-card__main">
                    {isRenaming ? (
                      <input
                        autoFocus
                        className="gs-field-card__rename"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onBlur={() => commitRename(field.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(field.id)
                          if (e.key === 'Escape') {
                            setEditingId(null)
                            setEditingName('')
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Rename ${field.name}`}
                      />
                    ) : (
                      <span className="gs-field-card__name">{field.name}</span>
                    )}
                    <span className="gs-field-card__sub">
                      {field.crop || 'Unspecified crop'} · {formatArea(field.areaHectares)}
                    </span>
                  </span>
                  <span className="gs-field-card__date">{formatShortDate(field.createdAt)}</span>
                </button>
                <div className="gs-field-card__actions" role="group" aria-label={`Actions for ${field.name}`}>
                  <button
                    type="button"
                    className="gs-field-card__btn"
                    title="Rename"
                    aria-label={`Rename ${field.name}`}
                    onClick={() => {
                      setEditingId(field.id)
                      setEditingName(field.name)
                    }}
                  >
                    <GsIcon name="pencil" size={13} />
                  </button>
                  <button
                    type="button"
                    className="gs-field-card__btn"
                    title="Zoom to field"
                    aria-label={`Zoom to ${field.name}`}
                    onClick={() => onZoomToField(field.id)}
                  >
                    <GsIcon name="zoom-in" size={13} />
                  </button>
                  <button
                    type="button"
                    className="gs-field-card__btn gs-field-card__btn--danger"
                    title="Delete field"
                    aria-label={`Delete ${field.name}`}
                    onClick={() => {
                      void appConfirm(
                        `The field "${field.name}", its boundary, and any saved metadata will be permanently removed.`,
                        {
                          title: 'Delete this field?',
                          confirmLabel: 'Delete field',
                          cancelLabel: 'Keep it',
                          danger: true,
                        },
                      ).then(ok => {
                        if (ok) onDeleteField(field.id)
                      })
                    }}
                  >
                    <GsIcon name="trash" size={13} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Selected-field detail card — pinned at the bottom so the user
          always knows which AOI the analytics belong to. */}
      {selectedField && (
        <section
          className="gs-field-detail"
          aria-label={`Details for ${selectedField.name}`}
          style={{ ['--field-color' as keyof React.CSSProperties as string]: selectedField.color } as React.CSSProperties}
        >
          <header className="gs-field-detail__head">
            <span className="gs-field-detail__swatch" aria-hidden="true" />
            <span className="gs-field-detail__title">{selectedField.name}</span>
            <button
              type="button"
              className="gs-field-detail__close"
              aria-label="Close field detail"
              onClick={() => onSelectField(null)}
            >
              <GsIcon name="x" size={14} />
            </button>
          </header>

          <div className="gs-field-detail__grid">
            <div className="gs-field-detail__stat">
              <span className="gs-field-detail__stat-label">Area</span>
              <strong>{formatArea(selectedField.areaHectares)}</strong>
            </div>
            <div className="gs-field-detail__stat">
              <span className="gs-field-detail__stat-label">Created</span>
              <strong>{formatShortDate(selectedField.createdAt)}</strong>
            </div>
            <div className="gs-field-detail__stat">
              <span className="gs-field-detail__stat-label">Updated</span>
              <strong>{formatShortDate(selectedField.updatedAt)}</strong>
            </div>
          </div>

          {/* Linked Satellite layer chip — surfaces the WMS layer /
              spectral index that was active at save-time so the user
              can tell at a glance which scene this field's analytics
              were captured under (e.g. "NDVI · May 13, 2026"). The
              chip stays hidden for legacy fields persisted before this
              context was tracked. */}
          {selectedField.satelliteContext && (
            <div className="gs-field-detail__satlink" role="status">
              <span className="gs-field-detail__satlink-dot" aria-hidden="true" />
              <span className="gs-field-detail__satlink-label">Linked layer</span>
              <strong className="gs-field-detail__satlink-value">
                {selectedField.satelliteContext.layerName}
                {selectedField.satelliteContext.indexId &&
                selectedField.satelliteContext.indexId !==
                  selectedField.satelliteContext.layerName
                  ? ` · ${selectedField.satelliteContext.indexId}`
                  : ''}
              </strong>
              <span className="gs-field-detail__satlink-when">
                {formatShortDate(selectedField.satelliteContext.capturedAt)}
              </span>
            </div>
          )}

          {/* Crop selector — list-of-presets + free-text fallback. We use a
              datalist so the user can either pick a known crop or type a
              custom one (e.g. "Mango" not in the preset list). */}
          <label className="gs-field-detail__field">
            <span>Crop</span>
            <input
              type="text"
              list="gs-fields-crop-presets"
              value={selectedField.crop ?? ''}
              placeholder="e.g. Wheat, Corn / Maize…"
              onChange={e => onUpdateField(selectedField.id, { crop: e.target.value })}
            />
            <datalist id="gs-fields-crop-presets">
              {CROP_PRESETS.map(preset => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
          </label>

          <label className="gs-field-detail__field">
            <span>Notes</span>
            <textarea
              rows={2}
              value={selectedField.notes ?? ''}
              placeholder="Anything you want to remember about this field…"
              onChange={e => onUpdateField(selectedField.id, { notes: e.target.value })}
            />
          </label>

          {/* Indices preview. We deliberately surface them as
              "Pending — connect a satellite scene" rather than fake
              numbers, because the actual NDVI/NDWI/Moisture pipeline lives
              in the Satellite Intelligence module and isn't wired through
              the Fields store yet. The shape stays so a future commit can
              just populate `field.indices` and these read live. */}
          <div className="gs-field-detail__indices">
            {(['ndvi', 'ndwi', 'moisture'] as const).map(key => {
              const value = selectedField.indices?.[key]
              return (
                <div key={key} className="gs-field-index">
                  <span className="gs-field-index__label">{key.toUpperCase()}</span>
                  <strong className="gs-field-index__value">{typeof value === 'number' ? value.toFixed(2) : '—'}</strong>
                  <span className="gs-field-index__hint">
                    {typeof value === 'number' ? 'last sync' : 'pending sync'}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="gs-field-detail__actions">
            <button
              type="button"
              className="gs-field-detail__btn"
              onClick={() => onZoomToField(selectedField.id)}
            >
              <GsIcon name="zoom-in" size={13} /> Zoom to field
            </button>
            <button
              type="button"
              className="gs-field-detail__btn"
              onClick={() => onExportFieldGeoJSON(selectedField.id)}
            >
              <GsIcon name="download" size={13} /> Export GeoJSON
            </button>
          </div>
        </section>
      )}

      {/* Bottom utility row — bulk export. Visible regardless of selection
          so the user can grab the entire workspace as one file. */}
      {fields.length > 0 && (
        <div className="gs-fields-foot">
          <button
            type="button"
            className="gs-fields-foot__btn"
            onClick={onExportAllGeoJSON}
            title="Export every saved field as a single FeatureCollection"
          >
            <GsIcon name="download" size={13} /> Export all ({fields.length})
          </button>
        </div>
      )}

    </div>
  )
}
