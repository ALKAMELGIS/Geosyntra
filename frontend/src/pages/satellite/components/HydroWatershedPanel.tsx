import { useCallback } from 'react'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import { useDraggablePanel } from '../useDraggablePanel'
import type { HydroStageKey, HydroWatershedResult } from '../../../lib/hydroWatershed/hydroEngine'
import type { SiHydroLayerKey, SiHydroStreamMode } from '../utils/siHydroMapLayers'
import './HydroWatershedPanel.css'

export type HydroWatershedPanelProps = {
  hasAoi: boolean
  isRunning: boolean
  progress: number
  stage: HydroStageKey | null
  error: string | null
  result: HydroWatershedResult | null
  layerVis: Record<SiHydroLayerKey, boolean>
  onToggleLayer: (key: SiHydroLayerKey) => void
  streamMode: SiHydroStreamMode
  onStreamModeChange: (mode: SiHydroStreamMode) => void
  onRun: () => void
  onCancel: () => void
  onClose: () => void
  onExportLayer: (key: SiHydroLayerKey) => void
  onRemoveLayer: (key: SiHydroLayerKey) => void
}

const STAGE_LABEL: Record<HydroStageKey, string> = {
  aoi: 'Reading AOI',
  dem: 'Sampling elevation (DEM)',
  slope: 'Slope & hillshade',
  flowDir: 'Flow direction',
  flowAccum: 'Flow accumulation',
  streams: 'Drainage network',
  wetness: 'Wetness index',
  flood: 'Flood susceptibility',
  basin: 'Drainage basins',
  watershed: 'Watershed delineation',
}

const fmtNum = (v: number | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '—'

type CardRow = { label: string; value: string }

/** A single result layer card: icon, title, re-run, stat rows, eye/export/trash. */
function LayerCard({
  layerKey,
  icon,
  title,
  rows,
  visible,
  canExport,
  onToggle,
  onRerun,
  onExport,
  onRemove,
  children,
}: {
  layerKey: SiHydroLayerKey
  icon: string
  title: string
  rows: CardRow[]
  visible: boolean
  canExport: boolean
  onToggle: () => void
  onRerun: () => void
  onExport: () => void
  onRemove: () => void
  children?: React.ReactNode
}) {
  return (
    <section className="hydro-tool__card" data-layer={layerKey}>
      <div className="hydro-tool__card-head">
        <span className="hydro-tool__card-icon" aria-hidden>
          <i className={`fa-solid ${icon}`} />
        </span>
        <span className="hydro-tool__card-title">{title}</span>
        <button
          type="button"
          className="hydro-tool__icon-btn"
          onClick={onRerun}
          title="Re-run analysis"
          aria-label={`Re-run ${title}`}
        >
          <i className="fa-solid fa-rotate-right" aria-hidden />
        </button>
      </div>
      {children}
      <div className="hydro-tool__rows">
        {rows.map(r => (
          <div className="hydro-tool__row" key={r.label}>
            <span className="hydro-tool__row-lbl">{r.label}</span>
            <span className="hydro-tool__row-val">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="hydro-tool__actions">
        <button
          type="button"
          className={`hydro-tool__act hydro-tool__act--icon hydro-tool__act--eye ${visible ? 'is-on' : 'is-off'}`}
          onClick={onToggle}
          role="switch"
          aria-checked={visible}
          title={visible ? 'Hide layer' : 'Show layer'}
          aria-label={`${visible ? 'Hide' : 'Show'} ${title}`}
        >
          <i className={`fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
        </button>
        {canExport ? (
          <button
            type="button"
            className="hydro-tool__act hydro-tool__act--export"
            onClick={onExport}
            title="Export layer"
          >
            <i className="fa-solid fa-file-export" aria-hidden /> Export
          </button>
        ) : null}
        <button
          type="button"
          className="hydro-tool__act hydro-tool__act--icon hydro-tool__act--trash"
          onClick={onRemove}
          title="Remove layer"
          aria-label={`Remove ${title}`}
        >
          <i className="fa-solid fa-trash-can" aria-hidden />
        </button>
      </div>
    </section>
  )
}

/**
 * Hydro Watershed — terrain hydrology workflow cockpit. AOI → DEM → hillshade,
 * slope, flow accumulation, drainage network (Strahler/Shreve) & watershed.
 * Run-only, AOI-gated; mirrors the platform contextual-analysis tool aesthetic.
 */
export function HydroWatershedPanel({
  hasAoi,
  isRunning,
  progress,
  stage,
  error,
  result,
  layerVis,
  onToggleLayer,
  streamMode,
  onStreamModeChange,
  onRun,
  onCancel,
  onClose,
  onExportLayer,
  onRemoveLayer,
}: HydroWatershedPanelProps) {
  const { ref: isolationRef, ...isolation } = useMapOverlayIsolation(true, { native: true })
  const drag = useDraggablePanel()
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      drag.panelRef(node)
      isolationRef?.(node)
    },
    [drag, isolationRef],
  )

  const st = result?.stats
  const outlet = result?.outlet ?? st?.watershedOutlet ?? null

  return (
    <div className="hydro-tool" dir="auto" ref={setRoot} style={drag.style} {...isolation}>
      <header className="hydro-tool__head" {...drag.handleProps}>
        <span className="hydro-tool__brand-icon" aria-hidden>
          <i className="fa-solid fa-layer-group" />
        </span>
        <span className="hydro-tool__brand">
          <span className="hydro-tool__title">Hydro Watershed</span>
          <span className="hydro-tool__sub">Terrain hydrology workflow</span>
        </span>
        <button
          type="button"
          className="hydro-tool__close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      {/* Run / status */}
      {isRunning ? (
        <>
          <button type="button" className="hydro-tool__btn is-danger" onClick={onCancel}>
            <i className="fa-solid fa-stop" aria-hidden /> Cancel analysis
          </button>
          <div className="hydro-tool__scan" role="progressbar">
            <span
              className="hydro-tool__scan-bar"
              style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }}
            />
          </div>
          {stage ? <div className="hydro-tool__stage">{STAGE_LABEL[stage]}</div> : null}
        </>
      ) : (
        <button
          type="button"
          className="hydro-tool__btn is-primary"
          onClick={onRun}
          disabled={!hasAoi}
          title={hasAoi ? 'Run the terrain hydrology workflow on the AOI' : 'Draw or select an AOI first'}
        >
          <i className="fa-solid fa-gear" aria-hidden /> Run analysis
        </button>
      )}

      {!hasAoi ? (
        <div className="hydro-tool__hint">
          <i className="fa-solid fa-circle-info" aria-hidden /> Requires an active AOI — draw or
          select one on the map.
        </div>
      ) : null}
      {error ? <div className="hydro-tool__err">{error}</div> : null}

      {/* Results */}
      {result && st ? (
        <>
          <LayerCard
            layerKey="elevation"
            icon="fa-mountain"
            title="Elevation"
            visible={layerVis.elevation}
            canExport
            onToggle={() => onToggleLayer('elevation')}
            onRerun={onRun}
            onExport={() => onExportLayer('elevation')}
            onRemove={() => onRemoveLayer('elevation')}
            rows={[
              { label: 'Min elevation', value: `${fmtNum(st.elevMin)} m` },
              { label: 'Max elevation', value: `${fmtNum(st.elevMax)} m` },
              { label: 'Relief', value: `${fmtNum(st.reliefM)} m` },
              { label: 'Resolution', value: `${fmtNum(st.cellSizeM)} m/px` },
            ]}
          />

          <LayerCard
            layerKey="hillshade"
            icon="fa-mountain-sun"
            title="Hillshade"
            visible={layerVis.hillshade}
            canExport
            onToggle={() => onToggleLayer('hillshade')}
            onRerun={onRun}
            onExport={() => onExportLayer('hillshade')}
            onRemove={() => onRemoveLayer('hillshade')}
            rows={[
              { label: 'Sun azimuth', value: `${fmtNum(st.sunAzimuthDeg)}°` },
              { label: 'Sun altitude', value: `${fmtNum(st.sunAltitudeDeg)}°` },
            ]}
          />

          <LayerCard
            layerKey="slope"
            icon="fa-chart-line"
            title="Slope"
            visible={layerVis.slope}
            canExport
            onToggle={() => onToggleLayer('slope')}
            onRerun={onRun}
            onExport={() => onExportLayer('slope')}
            onRemove={() => onRemoveLayer('slope')}
            rows={[
              { label: 'Mean slope', value: `${fmtNum(st.meanSlopeDeg)}°` },
              { label: 'Max slope', value: `${fmtNum(st.maxSlopeDeg)}°` },
            ]}
          />

          <LayerCard
            layerKey="flowAccum"
            icon="fa-bars-staggered"
            title="Flow accumulation"
            visible={layerVis.flowAccum}
            canExport
            onToggle={() => onToggleLayer('flowAccum')}
            onRerun={onRun}
            onExport={() => onExportLayer('flowAccum')}
            onRemove={() => onRemoveLayer('flowAccum')}
            rows={[{ label: 'Max contributing cells', value: fmtNum(st.maxContributingCells) }]}
          />

          <LayerCard
            layerKey="streams"
            icon="fa-sitemap"
            title="Stream network"
            visible={layerVis.streams}
            canExport
            onToggle={() => onToggleLayer('streams')}
            onRerun={onRun}
            onExport={() => onExportLayer('streams')}
            onRemove={() => onRemoveLayer('streams')}
            rows={[
              { label: 'Stream segments', value: fmtNum(st.streamSegments) },
              { label: 'Channel length', value: `${fmtNum(st.streamLengthKm)} km` },
              { label: 'Max Strahler order', value: fmtNum(st.maxStreamOrder) },
              { label: 'Max Shreve magnitude', value: fmtNum(st.maxShreveMagnitude) },
            ]}
          >
            <div className="hydro-tool__seg" role="tablist" aria-label="Stream ordering">
              <button
                type="button"
                role="tab"
                aria-selected={streamMode === 'strahler'}
                className={`hydro-tool__seg-btn${streamMode === 'strahler' ? ' is-active' : ''}`}
                onClick={() => onStreamModeChange('strahler')}
              >
                Strahler
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={streamMode === 'shreve'}
                className={`hydro-tool__seg-btn${streamMode === 'shreve' ? ' is-active' : ''}`}
                onClick={() => onStreamModeChange('shreve')}
              >
                Shreve
              </button>
            </div>
          </LayerCard>

          <LayerCard
            layerKey="watershed"
            icon="fa-fill-drip"
            title="Watershed"
            visible={layerVis.watershed}
            canExport
            onToggle={() => onToggleLayer('watershed')}
            onRerun={onRun}
            onExport={() => onExportLayer('watershed')}
            onRemove={() => onRemoveLayer('watershed')}
            rows={[
              { label: 'Basin area', value: `${fmtNum(st.watershedAreaKm2)} km²` },
              {
                label: 'Outlet',
                value: outlet ? `${outlet[0].toFixed(4)}, ${outlet[1].toFixed(4)}` : '—',
              },
            ]}
          />
        </>
      ) : null}
    </div>
  )
}

export default HydroWatershedPanel
