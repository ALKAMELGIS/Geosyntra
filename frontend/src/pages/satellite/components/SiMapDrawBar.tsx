import type {
  AoiDrawShapeTool,
  AoiGeometryEditSubTool,
  SiMapInteractionMode,
} from './aoi/siAoiModuleTypes'
import './SiMapDrawBar.css'

/**
 * Geosyntra · Map Draw Bar
 * ------------------------
 * A standalone, horizontally-laid-out floating glass toolbar that lives on top
 * of the Satellite Intelligence map. It is the single "main tool box" the user
 * reaches for to sketch and edit an AOI without opening the side dock.
 *
 * Visibility is owned by the host (Satellite Intelligence) and toggled from the
 * map toolbox rail's "Edit Tools" button. While open it shows the full row of
 * drawing tools; the "Edit" tool toggles a second segment with vertex-level
 * editing sub-tools (move / add / remove vertex, reshape, rotate, scale).
 *
 * All map mutation is delegated to the host through the callback props.
 */

export type SiMapDrawBarProps = {
  /** Controlled visibility — opened/closed from the map toolbox rail. */
  open: boolean
  onClose: () => void
  interactionMode: SiMapInteractionMode
  onViewMode: () => void
  onMoveMode: () => void
  drawShape: AoiDrawShapeTool
  onSelectShape: (shape: AoiDrawShapeTool) => void
  hasMoveSelection: boolean
  hasClearableDrawing: boolean
  onClearDrawing: () => void
  hasEditableGeometry: boolean
  editEnabled: boolean
  onToggleEdit: () => void
  editSubTool: AoiGeometryEditSubTool
  onEditSubTool: (tool: AoiGeometryEditSubTool) => void
  showAllVertices: boolean
  onToggleShowAllVertices: () => void
}

const SHAPE_TOOLS: { id: AoiDrawShapeTool; icon: string; title: string }[] = [
  { id: 'rectangle', icon: 'fa-regular fa-square', title: 'Rectangle AOI' },
  { id: 'circle', icon: 'fa-regular fa-circle', title: 'Circle AOI' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', title: 'Polygon AOI' },
  { id: 'freehand', icon: 'fa-solid fa-pen-fancy', title: 'Freehand sketch' },
]

const EDIT_SUBTOOLS: { id: AoiGeometryEditSubTool; icon: string; title: string }[] = [
  { id: 'vertex', icon: 'fa-solid fa-circle-dot', title: 'Move vertex' },
  { id: 'addVertex', icon: 'fa-solid fa-plus', title: 'Add vertex (click edge)' },
  { id: 'removeVertex', icon: 'fa-solid fa-minus', title: 'Remove vertex' },
  { id: 'reshape', icon: 'fa-solid fa-bezier-curve', title: 'Reshape boundary' },
  { id: 'rotate', icon: 'fa-solid fa-rotate', title: 'Rotate around center' },
  { id: 'scale', icon: 'fa-solid fa-up-right-and-down-left-from-center', title: 'Scale from corner' },
]

/** Compact green brand glyph (sprout/cross) shown next to the DRAW label. */
function DrawBrandGlyph() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21V11" />
      <path d="M12 11C12 7.5 9.5 5 6 5c0 3.5 2.5 6 6 6Z" />
      <path d="M12 11c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
    </svg>
  )
}

export function SiMapDrawBar({
  open,
  onClose,
  interactionMode,
  onViewMode,
  onMoveMode,
  drawShape,
  onSelectShape,
  hasMoveSelection,
  hasClearableDrawing,
  onClearDrawing,
  hasEditableGeometry,
  editEnabled,
  onToggleEdit,
  editSubTool,
  onEditSubTool,
  showAllVertices,
  onToggleShowAllVertices,
}: SiMapDrawBarProps) {
  if (!open) return null

  const viewActive = interactionMode === 'view' && !editEnabled
  const moveActive = interactionMode === 'move'

  return (
    <div className="si-map-draw-bar" role="toolbar" aria-label="Drawing and editing tools">
      <span className="si-map-draw-bar__brand" aria-hidden>
        <DrawBrandGlyph />
        <span className="si-map-draw-bar__brand-label">DRAW</span>
      </span>

      <span className="si-map-draw-bar__sep" aria-hidden role="separator" />

      <button
        type="button"
        className={`si-map-draw-tool${viewActive ? ' si-map-draw-tool--on' : ''}`}
        title="View — pan and zoom"
        aria-label="View — pan and zoom"
        aria-pressed={viewActive}
        onClick={onViewMode}
      >
        <i className="fa-solid fa-hand" aria-hidden />
      </button>

      {SHAPE_TOOLS.map(t => {
        const on = interactionMode === 'draw' && drawShape === t.id
        return (
          <button
            key={t.id}
            type="button"
            className={`si-map-draw-tool${on ? ' si-map-draw-tool--on' : ''}`}
            title={t.title}
            aria-label={t.title}
            aria-pressed={on}
            onClick={() => onSelectShape(t.id)}
          >
            <i className={t.icon} aria-hidden />
          </button>
        )
      })}

      <button
        type="button"
        className={`si-map-draw-tool${moveActive ? ' si-map-draw-tool--on' : ''}`}
        title={hasMoveSelection ? 'Move selected shape' : 'Select a shape first, then Move'}
        aria-label="Move selected shape"
        aria-pressed={moveActive}
        disabled={!hasMoveSelection}
        onClick={onMoveMode}
      >
        <i className="fa-solid fa-up-down-left-right" aria-hidden />
      </button>

      <button
        type="button"
        className={`si-map-draw-tool${editEnabled ? ' si-map-draw-tool--on' : ''}`}
        title={
          !hasEditableGeometry
            ? 'Draw or select an AOI first, then Edit to change its vertices'
            : editEnabled
              ? 'Exit Edit — stop editing vertices'
              : 'Edit — move / add / remove vertices, reshape, rotate, scale'
        }
        aria-label="Edit AOI geometry"
        aria-pressed={editEnabled}
        disabled={!hasEditableGeometry}
        onClick={onToggleEdit}
      >
        <i className="fa-solid fa-pen-to-square" aria-hidden />
      </button>

      <button
        type="button"
        className="si-map-draw-tool si-map-draw-tool--danger"
        title="Clear all drawings"
        aria-label="Clear all drawings"
        disabled={!hasClearableDrawing}
        onClick={onClearDrawing}
      >
        <i className="fa-solid fa-eraser" aria-hidden />
      </button>

      <span className="si-map-draw-bar__sep" aria-hidden role="separator" />

      <button
        type="button"
        className="si-map-draw-tool si-map-draw-tool--close"
        title="Close drawing tools"
        aria-label="Close drawing tools"
        onClick={onClose}
      >
        <i className="fa-solid fa-xmark" aria-hidden />
      </button>

      {editEnabled ? (
        <div
          className="si-map-draw-bar__edit-row"
          role="toolbar"
          aria-label="Edit AOI vertices"
        >
          {EDIT_SUBTOOLS.map(st => (
            <button
              key={st.id}
              type="button"
              className={`si-map-draw-tool${editSubTool === st.id ? ' si-map-draw-tool--on' : ''}`}
              title={st.title}
              aria-label={st.title}
              aria-pressed={editSubTool === st.id}
              onClick={() => onEditSubTool(st.id)}
            >
              <i className={st.icon} aria-hidden />
            </button>
          ))}
          <span className="si-map-draw-bar__sep" aria-hidden role="separator" />
          <button
            type="button"
            className={`si-map-draw-tool${showAllVertices ? ' si-map-draw-tool--on' : ''}`}
            title={showAllVertices ? 'Show fewer vertex handles' : 'Show all vertex handles'}
            aria-label="Toggle all vertex handles"
            aria-pressed={showAllVertices}
            onClick={onToggleShowAllVertices}
          >
            <i className="fa-solid fa-circle-nodes" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}
