import type { AoiGeometryEditSubTool, MapDrawTool, SiAoiDrawnStats, SiAoiWorkspaceRow } from './siAoiModuleTypes'
import { SiAoiGeometryEditControls } from './SiAoiGeometryEditControls'
import './siAoiModule.css'

export type SiAoiObjectsPanelProps = {
  variant?: 'dock' | 'compact'
  mapTool: MapDrawTool
  onMapTool: (tool: MapDrawTool) => void
  hasClearableDrawing: boolean
  onClearDrawing: () => void
  hasAoi: boolean
  drawAssistHint?: string
  multiAoiItems: SiAoiWorkspaceRow[]
  activeMultiAoiId: string | null
  onSelectAoi: (id: string) => void
  onRenameAoi: (id: string, name: string) => void
  onRemoveAoi: (id: string) => void
  drawnStats?: SiAoiDrawnStats | null
  fieldTimelineSessionActive?: boolean
  onGenerateTimeline?: () => void
  onStopTimeline?: () => void
  onOpenAoiPanel?: () => void
  hasEditableGeometry?: boolean
  aoiEditEnabled?: boolean
  onToggleAoiEdit?: () => void
  aoiEditSubTool?: AoiGeometryEditSubTool
  onAoiEditSubTool?: (tool: AoiGeometryEditSubTool) => void
  aoiEditShowAllVertices?: boolean
  onToggleAoiEditAllVertices?: () => void
}

const DOCK_TOOLS: { id: MapDrawTool; icon: string; label: string; title: string }[] = [
  { id: 'rectangle', icon: 'fa-regular fa-square', label: 'Rectangle', title: 'Rectangle AOI' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', label: 'Polygon', title: 'Polygon AOI' },
  { id: 'circle', icon: 'fa-regular fa-circle', label: 'Circle', title: 'Circle AOI' },
  { id: 'freehand', icon: 'fa-solid fa-pen-fancy', label: 'Freehand', title: 'Freehand sketch' },
  { id: 'move', icon: 'fa-solid fa-up-down-left-right', label: 'Move', title: 'Move AOI on map' },
  { id: 'select', icon: 'fa-solid fa-arrow-pointer', label: 'Select', title: 'Select (view — right-click for Edit Draw)' },
]

export function SiAoiObjectsPanel({
  variant = 'dock',
  mapTool,
  onMapTool,
  hasClearableDrawing,
  onClearDrawing,
  hasAoi,
  drawAssistHint,
  multiAoiItems,
  activeMultiAoiId,
  onSelectAoi,
  onRenameAoi,
  onRemoveAoi,
  drawnStats,
  fieldTimelineSessionActive = false,
  onGenerateTimeline,
  onStopTimeline,
  hasEditableGeometry = false,
  aoiEditEnabled = false,
  onToggleAoiEdit,
  aoiEditSubTool = 'vertex',
  onAoiEditSubTool,
  aoiEditShowAllVertices = false,
  onToggleAoiEditAllVertices,
}: SiAoiObjectsPanelProps) {
  const compact = variant === 'compact'

  return (
    <div className={`si-aoi-module${compact ? ' si-aoi-module--compact' : ''}`}>
      {!compact ? (
        <div className="si-aoi-module__flow" aria-label="AOI workflow">
          <strong>Objects of Interest</strong>
          <i className="fa-solid fa-chevron-right" aria-hidden />
          <span>Drawing tools</span>
          <i className="fa-solid fa-chevron-right" aria-hidden />
          <span>Define extent</span>
          <i className="fa-solid fa-chevron-right" aria-hidden />
          <span>Run analysis</span>
        </div>
      ) : null}

      <p className={`si-aoi-module__status${hasAoi ? ' si-aoi-module__status--ok' : ''}`}>
        <i className={hasAoi ? 'fa-solid fa-draw-polygon' : 'fa-regular fa-map'} aria-hidden />
        {hasAoi
          ? 'AOI ready — Move translates the whole shape; right-click or Edit Draw changes vertices.'
          : 'Draw a polygon AOI on the map to define the analysis extent. AOIs are separate from live layers and the timeline.'}
      </p>

      {drawAssistHint ? <p className="si-aoi-module__status">{drawAssistHint}</p> : null}

      <section>
        <p className="si-aoi-module__section-kicker">Drawing tools</p>
        <div className="si-aoi-draw-toolbar__tools" role="toolbar" aria-label="AOI drawing tools embedded">
          {DOCK_TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`si-aoi-draw-tool${mapTool === t.id ? ' si-aoi-draw-tool--on' : ''}`}
              title={t.title}
              aria-label={t.title}
              aria-pressed={mapTool === t.id}
              onClick={() => onMapTool(t.id)}
            >
              <i className={t.icon} aria-hidden />
            </button>
          ))}
          <button
            type="button"
            className="si-aoi-draw-tool si-aoi-draw-tool--danger"
            title="Clear drawing"
            aria-label="Clear drawing"
            disabled={!hasClearableDrawing}
            onClick={onClearDrawing}
          >
            <i className="fa-solid fa-eraser" aria-hidden />
          </button>
        </div>
      </section>

      {onToggleAoiEdit && onAoiEditSubTool && onToggleAoiEditAllVertices ? (
        <section>
          <p className="si-aoi-module__section-kicker">Geometry editing</p>
          <SiAoiGeometryEditControls
            compact
            editEnabled={aoiEditEnabled}
            onToggleEdit={onToggleAoiEdit}
            hasEditableGeometry={hasEditableGeometry}
            subTool={aoiEditSubTool}
            onSubTool={onAoiEditSubTool}
            showAllVertices={aoiEditShowAllVertices}
            onToggleAllVertices={onToggleAoiEditAllVertices}
          />
        </section>
      ) : null}

      {multiAoiItems.length > 0 ? (
        <section>
          <p className="si-aoi-module__section-kicker">Saved AOIs ({multiAoiItems.length})</p>
          <ul className="si-aoi-module__list">
            {multiAoiItems.map(row => (
              <li
                key={row.id}
                className={`si-aoi-module__row${row.id === activeMultiAoiId ? ' si-aoi-module__row--active' : ''}`}
              >
                <span className="si-aoi-module__swatch" style={{ background: row.color }} aria-hidden />
                <div className="si-aoi-module__row-main">
                  <input
                    className="si-aoi-module__row-name"
                    value={row.name}
                    aria-label={`Rename ${row.name}`}
                    onChange={e => onRenameAoi(row.id, e.target.value)}
                    onFocus={() => onSelectAoi(row.id)}
                  />
                  <span className="si-aoi-module__row-meta">{row.source} · workspace AOI</span>
                </div>
                <div className="si-aoi-module__row-actions">
                  <button
                    type="button"
                    className="si-aoi-module__icon-btn"
                    title="Activate AOI"
                    aria-label={`Activate ${row.name}`}
                    onClick={() => onSelectAoi(row.id)}
                  >
                    <i className="fa-solid fa-crosshairs" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="si-aoi-module__icon-btn"
                    title="Remove AOI"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => onRemoveAoi(row.id)}
                  >
                    <i className="fa-solid fa-trash" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {drawnStats && hasAoi ? (
        <section>
          <p className="si-aoi-module__section-kicker">AOI statistics</p>
          <div className="si-aoi-module__stats">
            <StatCell k="Mean index" v={drawnStats.mean.toFixed(3)} />
            <StatCell k="Min" v={drawnStats.min.toFixed(3)} />
            <StatCell k="Max" v={drawnStats.max.toFixed(3)} />
            <StatCell k="Std dev" v={drawnStats.std.toFixed(3)} />
          </div>
        </section>
      ) : null}

      {onGenerateTimeline ? (
        <section className="si-aoi-module__actions">
          <button
            type="button"
            className="si-aoi-module__btn"
            disabled={!hasAoi}
            onClick={fieldTimelineSessionActive ? onStopTimeline : onGenerateTimeline}
          >
            <i
              className={fieldTimelineSessionActive ? 'fa-solid fa-stop' : 'fa-solid fa-chart-line'}
              aria-hidden
            />{' '}
            {fieldTimelineSessionActive ? 'Stop timeline' : 'Timeline AOI analysis'}
          </button>
          <button type="button" className="si-aoi-module__btn si-aoi-module__btn--ghost" onClick={() => onMapTool('polygon')}>
            <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw polygon AOI
          </button>
        </section>
      ) : null}
    </div>
  )
}

function StatCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="si-aoi-module__stat">
      <span className="si-aoi-module__stat-k">{k}</span>
      <span className="si-aoi-module__stat-v">{v}</span>
    </div>
  )
}
