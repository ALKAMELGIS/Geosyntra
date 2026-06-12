import type {
  AoiDrawShapeTool,
  AoiGeometryEditSubTool,
  SiMapInteractionMode,
} from './siAoiModuleTypes'
import { SiAoiGeometryEditControls } from './SiAoiGeometryEditControls'
import './siAoiModule.css'

export type SiAoiDrawingToolbarProps = {
  interactionMode: SiMapInteractionMode
  onInteractionMode: (mode: SiMapInteractionMode) => void
  drawShape: AoiDrawShapeTool
  onDrawShape: (shape: AoiDrawShapeTool) => void
  hasMoveSelection: boolean
  hasClearableDrawing: boolean
  onClearDrawing: () => void
  drawAssistHint?: string
  hidden?: boolean
  /** `floating` = map overlay; `embedded` = inside a side panel (e.g. AI Detection AOI). */
  variant?: 'floating' | 'embedded'
  hasEditableGeometry?: boolean
  aoiEditEnabled?: boolean
  onToggleAoiEdit?: () => void
  aoiEditSubTool?: AoiGeometryEditSubTool
  onAoiEditSubTool?: (tool: AoiGeometryEditSubTool) => void
  aoiEditShowAllVertices?: boolean
  onToggleAoiEditAllVertices?: () => void
}

const MODES: { id: SiMapInteractionMode; icon: string; title: string }[] = [
  { id: 'view', icon: 'fa-solid fa-hand', title: 'View — pan and zoom the map' },
  { id: 'draw', icon: 'fa-solid fa-pen-ruler', title: 'Draw — sketch AOI (map pan locked)' },
  { id: 'move', icon: 'fa-solid fa-up-down-left-right', title: 'Move — translate selected shape only' },
]

const SHAPES: { id: AoiDrawShapeTool; icon: string; title: string }[] = [
  { id: 'rectangle', icon: 'fa-regular fa-square', title: 'Rectangle AOI' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', title: 'Polygon AOI' },
  { id: 'circle', icon: 'fa-regular fa-circle', title: 'Circle AOI' },
  { id: 'freehand', icon: 'fa-solid fa-pen-fancy', title: 'Freehand (vertex sketch)' },
]

export function SiAoiDrawingToolbar({
  interactionMode,
  onInteractionMode,
  drawShape,
  onDrawShape,
  hasMoveSelection,
  hasClearableDrawing,
  onClearDrawing,
  drawAssistHint,
  hidden,
  variant = 'floating',
  hasEditableGeometry = false,
  aoiEditEnabled = false,
  onToggleAoiEdit,
  aoiEditSubTool = 'vertex',
  onAoiEditSubTool,
  aoiEditShowAllVertices = false,
  onToggleAoiEditAllVertices,
}: SiAoiDrawingToolbarProps) {
  if (hidden) return null

  const embedded = variant === 'embedded'
  const showEditControls = !!onToggleAoiEdit && !!onAoiEditSubTool && !!onToggleAoiEditAllVertices

  return (
    <div
      className={`si-aoi-draw-toolbar${embedded ? ' si-aoi-draw-toolbar--embedded' : ''}`}
      role="region"
      aria-label="AOI drawing tools"
    >
      {!embedded ? <p className="si-aoi-draw-toolbar__label">Drawing tools</p> : null}
      <div className="si-aoi-draw-toolbar__rows">
        <div className="si-aoi-draw-toolbar__tools" role="toolbar" aria-label="Draw shape">
          {SHAPES.map(t => (
            <button
              key={t.id}
              type="button"
              className={`si-aoi-draw-tool${interactionMode === 'draw' && drawShape === t.id ? ' si-aoi-draw-tool--on' : ''}`}
              title={t.title}
              aria-label={t.title}
              aria-pressed={interactionMode === 'draw' && drawShape === t.id}
              disabled={interactionMode !== 'draw'}
              onClick={() => onDrawShape(t.id)}
            >
              <i className={t.icon} aria-hidden />
            </button>
          ))}
          <button
            type="button"
            className="si-aoi-draw-tool si-aoi-draw-tool--danger"
            title="Clear AOI"
            aria-label="Clear AOI"
            disabled={!hasClearableDrawing}
            onClick={onClearDrawing}
          >
            <i className="fa-solid fa-eraser" aria-hidden />
          </button>
        </div>
        <div className="si-aoi-draw-toolbar__tools" role="toolbar" aria-label="Map interaction mode">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              className={`si-aoi-draw-tool${interactionMode === m.id ? ' si-aoi-draw-tool--on' : ''}`}
              title={
                m.id === 'move' && !hasMoveSelection
                  ? 'Select a shape in View mode first, then enable Move'
                  : m.title
              }
              aria-label={m.title}
              aria-pressed={interactionMode === m.id}
              disabled={m.id === 'move' && !hasMoveSelection}
              onClick={() => onInteractionMode(m.id)}
            >
              <i className={m.icon} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      {showEditControls && interactionMode === 'view' ? (
        <SiAoiGeometryEditControls
          compact={embedded}
          editEnabled={aoiEditEnabled}
          onToggleEdit={onToggleAoiEdit}
          hasEditableGeometry={hasEditableGeometry}
          subTool={aoiEditSubTool}
          onSubTool={onAoiEditSubTool}
          showAllVertices={aoiEditShowAllVertices}
          onToggleAllVertices={onToggleAoiEditAllVertices}
        />
      ) : null}
      {drawAssistHint ? <p className="si-aoi-draw-toolbar__hint">{drawAssistHint}</p> : null}
    </div>
  )
}
