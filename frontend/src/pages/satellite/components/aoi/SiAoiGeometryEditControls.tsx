import type { AoiGeometryEditSubTool } from '../../utils/siAoiGeometryEdit'
import './siAoiModule.css'

export type SiAoiGeometryEditControlsProps = {
  editEnabled: boolean
  onToggleEdit: () => void
  hasEditableGeometry: boolean
  subTool: AoiGeometryEditSubTool
  onSubTool: (tool: AoiGeometryEditSubTool) => void
  showAllVertices: boolean
  onToggleAllVertices: () => void
  compact?: boolean
}

const SUB_TOOLS: { id: AoiGeometryEditSubTool; icon: string; title: string }[] = [
  { id: 'vertex', icon: 'fa-solid fa-circle-dot', title: 'Move vertex' },
  { id: 'addVertex', icon: 'fa-solid fa-plus', title: 'Add vertex (click edge)' },
  { id: 'removeVertex', icon: 'fa-solid fa-minus', title: 'Remove vertex' },
  { id: 'reshape', icon: 'fa-solid fa-bezier-curve', title: 'Reshape boundary' },
  { id: 'rotate', icon: 'fa-solid fa-rotate', title: 'Rotate around center' },
  { id: 'scale', icon: 'fa-solid fa-up-right-and-down-left-from-center', title: 'Scale from corner' },
]

export function SiAoiGeometryEditControls({
  editEnabled,
  onToggleEdit,
  hasEditableGeometry,
  subTool,
  onSubTool,
  showAllVertices,
  onToggleAllVertices,
  compact = false,
}: SiAoiGeometryEditControlsProps) {
  return (
    <div
      className={`si-aoi-edit-controls${compact ? ' si-aoi-edit-controls--compact' : ''}`}
      role="region"
      aria-label="AOI geometry editing"
    >
      <div className="si-aoi-edit-controls__mode-row">
        <button
          type="button"
          className={`si-aoi-edit-toggle${editEnabled ? ' si-aoi-edit-toggle--on' : ''}`}
          aria-pressed={editEnabled}
          disabled={!hasEditableGeometry}
          title={editEnabled ? 'Exit Edit Draw mode' : 'Enable Edit Draw — vertices stay locked until enabled'}
          onClick={onToggleEdit}
        >
          <i className="fa-solid fa-pen-ruler" aria-hidden />
          <span>{editEnabled ? 'Editing on' : 'Edit Draw'}</span>
        </button>
        {editEnabled ? (
          <button
            type="button"
            className={`si-aoi-edit-vertices-toggle${showAllVertices ? ' si-aoi-edit-vertices-toggle--on' : ''}`}
            aria-pressed={showAllVertices}
            title={showAllVertices ? 'Show fewer handles' : 'Show all vertices'}
            onClick={onToggleAllVertices}
          >
            {showAllVertices ? 'All vertices' : 'Few handles'}
          </button>
        ) : null}
      </div>
      {editEnabled ? (
        <>
          <div className="si-aoi-draw-toolbar__tools si-aoi-edit-controls__tools" role="toolbar" aria-label="AOI edit tools">
            {SUB_TOOLS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`si-aoi-draw-tool${subTool === t.id ? ' si-aoi-draw-tool--on' : ''}`}
                title={t.title}
                aria-label={t.title}
                aria-pressed={subTool === t.id}
                onClick={() => onSubTool(t.id)}
              >
                <i className={t.icon} aria-hidden />
              </button>
            ))}
          </div>
          <p className="si-aoi-draw-toolbar__hint si-aoi-edit-controls__hint">
            Select = choose · Move = translate whole shape · Edit Draw = vertices (tools above).
          </p>
        </>
      ) : (
        <p className="si-aoi-draw-toolbar__hint si-aoi-edit-controls__hint">
          Select to choose · Move to translate · Edit Draw (toolbar or Shift+right-click) to change vertices.
        </p>
      )}
    </div>
  )
}
