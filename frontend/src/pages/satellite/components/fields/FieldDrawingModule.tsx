import { useCallback, useMemo } from 'react'
import './FieldDrawingModule.css'

/**
 * Geosyntra · Field Drawing Module
 * --------------------------------
 * A self-contained, horizontally-laid-out Glass One-UI toolbar that
 * exposes the six drawing primitives the Fields Data workspace needs:
 *
 *   1. Polygon    — free-form AOI sketch
 *   2. Rectangle  — orthogonal AOI sketch
 *   3. Circle     — circular AOI sketch
 *   4. Edit       — re-shape the currently selected saved field
 *   5. Delete     — remove the currently selected saved field
 *   6. Save       — commit the current draft / pending edit
 *
 * Architectural intent
 * --------------------
 * This module is **completely independent** from the Remote Sensing
 * AOI toolbar that ships inside the Remote Sensing card on the
 * Satellite Intelligence page. It owns its own:
 *   • Selected-shape state  (props from `FieldsPanel`)
 *   • Action callbacks      (each tool routes to a dedicated handler)
 *   • Visual styling        (`FieldDrawingModule.css` — never touches
 *                            `.si-map-analysis-toolbar*` selectors)
 *
 * The host page (Satellite Intelligence / GIS Map) is responsible for
 * translating the module's intent into the page's underlying drawing
 * pipeline (Mapbox GL listeners or Leaflet-Draw). That translation
 * layer is the single, deliberate place where Fields and Remote
 * Sensing both meet the actual map — but their UI state, toolbars,
 * and component trees are otherwise isolated to avoid the
 * cross-contamination the user reported.
 *
 * Behaviour notes
 * ---------------
 * • Polygon / Rectangle / Circle are **mutually exclusive** shape
 *   selectors — picking one only marks the *intent*, the actual map
 *   draw is armed when the user presses the "Add Draw New Field"
 *   CTA in `FieldsPanel`.
 * • Edit / Delete / Save are **action triggers** — they fire once
 *   per click and never persist a "pressed" state.
 * • Edit / Delete / Save become disabled when there is no
 *   `selectedFieldId` to operate on (controlled by `hasSelection`).
 * • The toolbar is intentionally compact (40px tall buttons in a
 *   single row) so it fits the panel on narrow rails without
 *   wrapping. On very narrow viewports the buttons shrink to icon-
 *   only labels (handled in CSS).
 */

export type FieldDrawShape = 'polygon' | 'rectangle' | 'circle'

export interface FieldDrawingModuleProps {
  /** Currently armed shape, or `null` when nothing is picked. */
  activeShape: FieldDrawShape | null
  /** Toggle the active shape. Pass the same shape twice to clear. */
  onSelectShape: (shape: FieldDrawShape) => void
  /** Enter edit mode for the currently selected saved field. */
  onEdit: () => void
  /** Delete the currently selected saved field (with confirmation in
   *  the host). */
  onDelete: () => void
  /** Commit the current draft / lock in the active edit. */
  onSave: () => void
  /** Open spectral / timeline charts for the active field workspace (optional). */
  onOpenSpectralCharts?: () => void
  /** True when the host has a saved field selected — controls
   *  whether Edit / Delete / Save can fire. */
  hasSelection: boolean
  /** True while the host has the underlying draw tool armed on the
   *  map. Lets the toolbar render a subtle "armed" pulse on the
   *  active shape so the user knows their next click commits a
   *  vertex, not a tool change. */
  isDrawingArmed: boolean
}

/* Inline SVG icons — Geosyntra ships `GsIcon` for the platform-wide
 * vocabulary (trash, pencil, save, etc.) but the three shape primitives
 * (polygon / rectangle / circle) aren't in that set, so we inline them
 * here at the same 16px stroke weight to keep the row visually
 * consistent across all six tools. */
function PolygonGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 21 9 17.5 20H6.5L3 9z" />
    </svg>
  )
}

function RectangleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={4} y={6} width={16} height={12} rx={1.5} />
    </svg>
  )
}

function CircleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={12} cy={12} r={7.5} />
    </svg>
  )
}

function EditGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 4.5 19.5 9.5" />
      <path d="m4 20 4.5-1L19.5 7.5a2 2 0 0 0 0-2.83l-.17-.17a2 2 0 0 0-2.83 0L5.5 15.5z" />
    </svg>
  )
}

function DeleteGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function SpectralChartsGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M5 14c2.5-1 4.5-4 7-4s4.5 3 7 4" />
      <path d="M5 10c2.5 1 4.5 4 7 4s4.5-3 7-4" />
    </svg>
  )
}

function SaveGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M7 4v5h8V4" />
      <path d="M7 14h10v7H7z" />
    </svg>
  )
}

export default function FieldDrawingModule({
  activeShape,
  onSelectShape,
  onEdit,
  onDelete,
  onSave,
  onOpenSpectralCharts,
  hasSelection,
  isDrawingArmed,
}: FieldDrawingModuleProps) {
  /* Memoise the shape descriptors so the JSX below stays compact and
   * the keyboard map (1/2/3 → polygon/rectangle/circle) reads cleanly
   * if we want to add shortcuts later. */
  const shapes = useMemo(
    () =>
      [
        { id: 'polygon' as const, label: 'Polygon', Glyph: PolygonGlyph },
        { id: 'rectangle' as const, label: 'Rectangle', Glyph: RectangleGlyph },
        { id: 'circle' as const, label: 'Circle', Glyph: CircleGlyph },
      ],
    [],
  )

  const handleShapeClick = useCallback(
    (shape: FieldDrawShape) => {
      onSelectShape(shape)
    },
    [onSelectShape],
  )

  return (
    <section
      className="gs-field-draw-module"
      role="toolbar"
      aria-label="Field drawing tools"
    >
      {/* Shape selectors — radiogroup-like, mutually exclusive. */}
      <div
        className="gs-field-draw-module__group gs-field-draw-module__group--shapes"
        role="radiogroup"
        aria-label="Shape"
      >
        {shapes.map(({ id, label, Glyph }) => {
          const isActive = activeShape === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${label} shape`}
              title={`${label} (use this shape for the next field)`}
              className={[
                'gs-field-draw-tool',
                'gs-field-draw-tool--shape',
                isActive ? 'is-active' : '',
                isActive && isDrawingArmed ? 'is-armed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleShapeClick(id)}
            >
              <Glyph size={16} />
            </button>
          )
        })}
      </div>

      {/* Vertical hairline separator — visually splits "what to draw"
          from "what to do with it" so the row reads in two passes. */}
      <span className="gs-field-draw-module__sep" aria-hidden="true" />

      {onOpenSpectralCharts ? (
        <>
          <div className="gs-field-draw-module__group gs-field-draw-module__group--charts">
            <button
              type="button"
              className="gs-field-draw-tool gs-field-draw-tool--charts"
              aria-label="Spectral charts and timeline"
              title="Open charts / timeline for fields"
              onClick={onOpenSpectralCharts}
            >
              <SpectralChartsGlyph size={16} />
            </button>
          </div>
          <span className="gs-field-draw-module__sep" aria-hidden="true" />
        </>
      ) : null}

      {/* Action triggers — operate on the currently selected field. */}
      <div className="gs-field-draw-module__group gs-field-draw-module__group--actions">
        <button
          type="button"
          aria-label="Edit selected field"
          title={hasSelection ? 'Edit the selected field shape' : 'Select a field first'}
          className="gs-field-draw-tool gs-field-draw-tool--action"
          disabled={!hasSelection}
          onClick={onEdit}
        >
          <EditGlyph size={16} />
        </button>
        <button
          type="button"
          aria-label="Delete selected field"
          title={hasSelection ? 'Delete the selected field' : 'Select a field first'}
          className="gs-field-draw-tool gs-field-draw-tool--action gs-field-draw-tool--danger"
          disabled={!hasSelection}
          onClick={onDelete}
        >
          <DeleteGlyph size={16} />
        </button>
        <button
          type="button"
          aria-label="Save current field"
          title={hasSelection ? 'Save changes to the selected field' : 'Save / commit'}
          className="gs-field-draw-tool gs-field-draw-tool--action gs-field-draw-tool--primary"
          disabled={!hasSelection}
          onClick={onSave}
        >
          <SaveGlyph size={16} />
        </button>
      </div>
    </section>
  )
}
