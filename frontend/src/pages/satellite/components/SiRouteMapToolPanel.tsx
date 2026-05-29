import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { GeoAiRouteSession } from '../../../lib/geoAiRoutePlan'
import { apiTokenUnavailableHint, canManagePlatformApiTokens } from '../../../lib/apiTokenOwnerPolicy'
import {
  getOpenRouteServiceApiKey,
  subscribeOpenRouteServiceApiKey,
} from '../../../lib/openRouteServiceApiKey'
import type { OrsIsochroneMinutes, OrsMatrixCell } from '../../../lib/openRouteServiceRouting'
import type { RouteMapProfile } from '../../../lib/graphHopperRouting'
import type { NavigationTurnStep, RouteElevationSample } from '../../../lib/geoAiRoutePlan'
import type { RoutePreference } from '../../../lib/siNavigationTypes'
import { SiRouteElevationChart } from './SiRouteElevationChart'
import { SiRouteTurnByTurnList } from './SiRouteTurnByTurnList'
import { clampFixedPanelPosition, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout'
import './SiRouteMapToolPanel.css'

const SI_ROUTE_MAP_POS_LS = 'si-route-map-panel-pos-v2'
const SI_ROUTE_MAP_SIZE_LS = 'si-route-map-panel-size-v1'

type PanelPos = { left: number; top: number }
type PanelSize = { width: number; height: number }

type ServiceTab = 'route' | 'isochrone' | 'matrix'
export type RouteMapPickTarget = 'start' | 'end' | 'isochrone' | 'matrix' | null

const ISOCHRONE_PRESETS: OrsIsochroneMinutes[] = [5, 10, 15, 30]

function defaultPanelPos(): PanelPos {
  return siMapLeftPopoutFixedPosition('route-map', 420)
}

function readStoredPos(): PanelPos {
  if (typeof window === 'undefined') return defaultPanelPos()
  try {
    const raw = localStorage.getItem(SI_ROUTE_MAP_POS_LS)
    if (!raw) return defaultPanelPos()
    const o = JSON.parse(raw) as { left?: unknown; top?: unknown }
    const left = Number(o.left)
    const top = Number(o.top)
    if (Number.isFinite(left) && Number.isFinite(top)) {
      if (typeof window !== 'undefined' && left > window.innerWidth * 0.52) {
        return defaultPanelPos()
      }
      return { left, top }
    }
  } catch {
    /* ignore */
  }
  return defaultPanelPos()
}

function readStoredSize(): PanelSize | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SI_ROUTE_MAP_SIZE_LS)
    if (!raw) return null
    const o = JSON.parse(raw) as { width?: unknown; height?: unknown }
    const width = Number(o.width)
    const height = Number(o.height)
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return {
        width: Math.min(520, Math.max(300, width)),
        height: Math.min(720, Math.max(360, height)),
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function clampPos(left: number, top: number, w: number, h: number): PanelPos {
  return clampFixedPanelPosition(left, top, w, h)
}

const PROFILES: { id: RouteMapProfile; label: string; icon: string }[] = [
  { id: 'car', label: 'Driving', icon: 'fa-car' },
  { id: 'truck', label: 'Truck', icon: 'fa-truck' },
  { id: 'foot', label: 'Walking', icon: 'fa-person-walking' },
  { id: 'bike', label: 'Cycling', icon: 'fa-bicycle' },
]

export type SiRouteMapToolPanelProps = {
  open: boolean
  minimized: boolean
  onMinimizedChange: (v: boolean) => void
  onClose: () => void
  startLabel: string
  endLabel: string
  onStartLabelChange: (v: string) => void
  onEndLabelChange: (v: string) => void
  profile: RouteMapProfile
  onProfileChange: (p: RouteMapProfile) => void
  onComputeRoute: () => void
  busy: boolean
  error: string | null
  session: GeoAiRouteSession | null
  onSelectRouteIndex: (index: number) => void
  mapboxAccessToken?: string
  apiTokensHref?: string | undefined
  pickTarget: RouteMapPickTarget
  onPickTargetChange: (t: RouteMapPickTarget) => void
  isochroneEnabled: boolean
  onIsochroneEnabledChange: (v: boolean) => void
  isochroneMinutes: OrsIsochroneMinutes[]
  onIsochroneMinutesChange: (mins: OrsIsochroneMinutes[]) => void
  isochroneCenterLabel: string
  onIsochroneCenterLabelChange: (v: string) => void
  onComputeIsochrone: () => void
  matrixLocationsText: string
  onMatrixLocationsTextChange: (v: string) => void
  onComputeMatrix: () => void
  matrixCells: OrsMatrixCell[]
  onSnapEndpoints: () => void
  onClearMapLayers: () => void
  waypoints?: string[]
  onWaypointsChange?: (next: string[]) => void
  onSwapEndpoints?: () => void
  routePreference?: RoutePreference
  onRoutePreferenceChange?: (p: RoutePreference) => void
  compareFastestShortest?: boolean
  onCompareFastestShortestChange?: (v: boolean) => void
  navigationActive?: boolean
  onStartNavigation?: () => void
  onStopNavigation?: () => void
  voiceEnabled?: boolean
  onVoiceEnabledChange?: (v: boolean) => void
  navStepIndex?: number
  onNavStepIndexChange?: (i: number) => void
  fuelLiters?: number | null
  turnSteps?: NavigationTurnStep[]
  elevationProfile?: RouteElevationSample[]
}

export function SiRouteMapToolPanel(props: SiRouteMapToolPanelProps) {
  const {
    open,
    minimized,
    onMinimizedChange,
    onClose,
    startLabel,
    endLabel,
    onStartLabelChange,
    onEndLabelChange,
    profile,
    onProfileChange,
    onComputeRoute,
    busy,
    error,
    session,
    onSelectRouteIndex,
    apiTokensHref = '#/settings/api-integrations',
    pickTarget,
    onPickTargetChange,
    isochroneEnabled,
    onIsochroneEnabledChange,
    isochroneMinutes,
    onIsochroneMinutesChange,
    isochroneCenterLabel,
    onIsochroneCenterLabelChange,
    onComputeIsochrone,
    matrixLocationsText,
    onMatrixLocationsTextChange,
    onComputeMatrix,
    matrixCells,
    onSnapEndpoints,
    onClearMapLayers,
    waypoints = [],
    onWaypointsChange,
    onSwapEndpoints,
    routePreference = 'recommended',
    onRoutePreferenceChange,
    compareFastestShortest = false,
    onCompareFastestShortestChange,
    navigationActive = false,
    onStartNavigation,
    onStopNavigation,
    voiceEnabled = false,
    onVoiceEnabledChange,
    navStepIndex = 0,
    onNavStepIndexChange,
    fuelLiters,
    turnSteps = [],
    elevationProfile = [],
  } = props

  const shellRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<PanelPos>(readStoredPos())
  const [pos, setPos] = useState<PanelPos>(posRef.current)
  const [panelSize, setPanelSize] = useState<PanelSize | null>(readStoredSize())
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [hasOrsKey, setHasOrsKey] = useState(() => Boolean(getOpenRouteServiceApiKey()))
  const [serviceTab, setServiceTab] = useState<ServiceTab>('route')

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  useEffect(() => subscribeOpenRouteServiceApiKey(() => setHasOrsKey(Boolean(getOpenRouteServiceApiKey()))), [])

  const measure = useCallback(() => {
    const el = shellRef.current
    if (!el) return { width: panelSize?.width ?? 360, height: panelSize?.height ?? 480 }
    const r = el.getBoundingClientRect()
    return { width: r.width || 360, height: r.height || 480 }
  }, [panelSize])

  useLayoutEffect(() => {
    if (!open) return
    const size = measure()
    setPos(prev => clampPos(prev.left, prev.top, size.width, size.height))
  }, [open, minimized, measure, panelSize])

  const persistPos = useCallback((p: PanelPos) => {
    try {
      localStorage.setItem(SI_ROUTE_MAP_POS_LS, JSON.stringify(p))
    } catch {
      /* ignore */
    }
  }, [])

  const persistSize = useCallback((s: PanelSize) => {
    try {
      localStorage.setItem(SI_ROUTE_MAP_SIZE_LS, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [])

  const onDragHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      const start = { ...posRef.current, cx: e.clientX, cy: e.clientY }
      setDragging(true)
      const handle = e.currentTarget
      try {
        handle.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const onMove = (ev: PointerEvent) => {
        const size = measure()
        const next = clampPos(
          start.left + (ev.clientX - start.cx),
          start.top + (ev.clientY - start.cy),
          size.width,
          size.height,
        )
        setPos(next)
      }
      const finish = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        setDragging(false)
        persistPos(posRef.current)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
    },
    [measure, persistPos],
  )

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const size0 = measure()
      const start = { w: size0.width, h: size0.height, cx: e.clientX, cy: e.clientY }
      setResizing(true)
      const onMove = (ev: PointerEvent) => {
        const w = Math.min(520, Math.max(300, start.w + (ev.clientX - start.cx)))
        const h = Math.min(720, Math.max(360, start.h + (ev.clientY - start.cy)))
        setPanelSize({ width: w, height: h })
      }
      const finish = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        setResizing(false)
        const el = shellRef.current
        if (el) {
          const r = el.getBoundingClientRect()
          persistSize({ width: r.width, height: r.height })
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
    },
    [measure, persistSize],
  )

  const toggleIsochroneMinute = (m: OrsIsochroneMinutes) => {
    if (isochroneMinutes.includes(m)) {
      const next = isochroneMinutes.filter(x => x !== m)
      onIsochroneMinutesChange(next.length ? next : [15])
    } else {
      onIsochroneMinutesChange([...isochroneMinutes, m].sort((a, b) => a - b))
    }
  }

  const active = session?.options[session.selectedIndex] ?? session?.options[0]
  const providerLabel =
    session?.provider === 'openrouteservice'
      ? 'OpenRouteService'
      : session?.provider === 'graphhopper'
        ? 'GraphHopper'
        : session?.provider === 'google_maps_platform'
          ? 'Google Routes'
          : 'Routing engine'

  const shellStyle: React.CSSProperties = {
    left: pos.left,
    top: pos.top,
    ...(panelSize
      ? { width: panelSize.width, maxHeight: panelSize.height, height: panelSize.height }
      : {}),
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={shellRef}
          className={
            'si-route-map-panel' +
            (minimized ? ' si-route-map-panel--min' : '') +
            (dragging ? ' si-route-map-panel--dragging' : '') +
            (resizing ? ' si-route-map-panel--resizing' : '') +
            (panelSize ? ' si-route-map-panel--sized' : '')
          }
          style={shellStyle}
          role="dialog"
          aria-label="Route Map"
          initial={{ opacity: 0, x: -24, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="si-route-map-panel__drag"
            onPointerDown={onDragHandlePointerDown}
            aria-hidden
          />
          <header className="si-route-map-panel__head">
            <motion.div className="si-route-map-panel__brand" layout="position">
              <i className="fa-solid fa-route" aria-hidden />
              <motion.div layout="position">
                <h2 className="si-route-map-panel__title">Route Map</h2>
                <p className="si-route-map-panel__sub">Street routing · {providerLabel}</p>
              </motion.div>
            </motion.div>
            <div className="si-route-map-panel__head-actions">
              <button
                type="button"
                className="si-route-map-panel__icon-btn"
                onClick={() => onMinimizedChange(!minimized)}
                aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
              >
                <i className={`fa-solid ${minimized ? 'fa-up-right-and-down-left-from-center' : 'fa-window-minimize'}`} />
              </button>
              <button
                type="button"
                className="si-route-map-panel__icon-btn"
                onClick={onClose}
                aria-label="Close Route Map"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </header>

          {!minimized ? (
            <motion.div
              className="si-route-map-panel__body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {!hasOrsKey ? (
                <p className="si-route-map-panel__hint">
                  {canManagePlatformApiTokens() ? (
                    <>
                      Add an{' '}
                      <a href={apiTokensHref} className="si-route-map-panel__link">
                        OpenRouteService API key
                      </a>{' '}
                      in API Manager for directions, isochrones, matrix, and road snapping.
                    </>
                  ) : (
                    apiTokenUnavailableHint('OpenRouteService routing')
                  )}
                </p>
              ) : null}

              <div className="si-route-map-panel__tabs" role="tablist" aria-label="Routing services">
                {(
                  [
                    ['route', 'Directions', 'fa-diamond-turn-right'],
                    ['isochrone', 'Isochrone', 'fa-draw-polygon'],
                    ['matrix', 'Matrix', 'fa-table'],
                  ] as const
                ).map(([id, label, icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={serviceTab === id}
                    className={`si-route-map-panel__tab${serviceTab === id ? ' is-active' : ''}`}
                    onClick={() => setServiceTab(id)}
                  >
                    <i className={`fa-solid ${icon}`} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>

              <motion.div className="si-route-map-panel__modes" role="group" aria-label="Route type">
                {PROFILES.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={`si-route-map-panel__mode${profile === m.id ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => onProfileChange(m.id)}
                    title={m.label}
                  >
                    <i className={`fa-solid ${m.icon}`} aria-hidden />
                    <span>{m.label}</span>
                  </button>
                ))}
              </motion.div>

              {serviceTab === 'route' ? (
                <>
                  <div className="si-route-map-panel__pick-row">
                    <button
                      type="button"
                      className={`si-route-map-panel__pick${pickTarget === 'start' ? ' is-active' : ''}`}
                      disabled={busy}
                      onClick={() => onPickTargetChange(pickTarget === 'start' ? null : 'start')}
                    >
                      <i className="fa-solid fa-crosshairs" aria-hidden />
                      Pick start on map
                    </button>
                    <button
                      type="button"
                      className={`si-route-map-panel__pick${pickTarget === 'end' ? ' is-active' : ''}`}
                      disabled={busy}
                      onClick={() => onPickTargetChange(pickTarget === 'end' ? null : 'end')}
                    >
                      <i className="fa-solid fa-crosshairs" aria-hidden />
                      Pick destination
                    </button>
                  </div>

                  <div className="si-route-map-panel__route-stack">
                    {onSwapEndpoints ? (
                      <button
                        type="button"
                        className="si-route-map-panel__swap"
                        disabled={busy}
                        onClick={onSwapEndpoints}
                        title="Swap start and destination"
                        aria-label="Swap start and destination"
                      >
                        <i className="fa-solid fa-arrows-up-down" aria-hidden />
                      </button>
                    ) : null}
                    <div className="si-route-map-panel__route-fields">
                      <label className="si-route-map-panel__field">
                        <span className="si-route-map-panel__field-k">
                          <i className="fa-regular fa-circle si-route-map-panel__pin si-route-map-panel__pin--start" />
                          Start
                        </span>
                        <input
                          type="text"
                          className="si-route-map-panel__input"
                          value={startLabel}
                          onChange={e => onStartLabelChange(e.target.value)}
                          placeholder="Choose starting point, or click on the map"
                          disabled={busy}
                        />
                      </label>
                      {waypoints.map((wp, wi) => (
                        <label key={`wp-${wi}`} className="si-route-map-panel__field">
                          <span className="si-route-map-panel__field-k">
                            <i className="fa-solid fa-circle si-route-map-panel__pin si-route-map-panel__pin--stop" />
                            Stop {wi + 1}
                          </span>
                          <div className="si-route-map-panel__wp-row">
                            <input
                              type="text"
                              className="si-route-map-panel__input"
                              value={wp}
                              onChange={e => {
                                const next = [...waypoints]
                                next[wi] = e.target.value
                                onWaypointsChange?.(next)
                              }}
                              placeholder="Add stop address"
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className="si-route-map-panel__wp-remove"
                              disabled={busy}
                              onClick={() => onWaypointsChange?.(waypoints.filter((_, j) => j !== wi))}
                              aria-label={`Remove stop ${wi + 1}`}
                            >
                              <i className="fa-solid fa-xmark" aria-hidden />
                            </button>
                          </div>
                        </label>
                      ))}
                      <label className="si-route-map-panel__field">
                        <span className="si-route-map-panel__field-k">
                          <i className="fa-solid fa-location-dot si-route-map-panel__pin si-route-map-panel__pin--end" />
                          Destination
                        </span>
                        <input
                          type="text"
                          className="si-route-map-panel__input"
                          value={endLabel}
                          onChange={e => onEndLabelChange(e.target.value)}
                          placeholder="Choose destination…"
                          disabled={busy}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onComputeRoute()
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {onWaypointsChange ? (
                    <button
                      type="button"
                      className="si-route-map-panel__secondary si-route-map-panel__secondary--block"
                      disabled={busy || waypoints.length >= 8}
                      onClick={() => onWaypointsChange([...waypoints, ''])}
                    >
                      <i className="fa-solid fa-plus" aria-hidden />
                      Add stop
                    </button>
                  ) : null}

                  <div className="si-route-map-panel__pref-row">
                    <span className="si-route-map-panel__pref-label">Route</span>
                    <select
                      className="si-route-map-panel__select"
                      value={routePreference}
                      disabled={busy}
                      onChange={e => onRoutePreferenceChange?.(e.target.value as RoutePreference)}
                    >
                      <option value="recommended">Recommended</option>
                      <option value="fastest">Fastest</option>
                      <option value="shortest">Shortest</option>
                    </select>
                    {onCompareFastestShortestChange ? (
                      <label className="si-route-map-panel__check-inline">
                        <input
                          type="checkbox"
                          checked={compareFastestShortest}
                          disabled={busy}
                          onChange={e => onCompareFastestShortestChange(e.target.checked)}
                        />
                        Compare fastest & shortest
                      </label>
                    ) : null}
                  </div>

                  <div className="si-route-map-panel__secondary-row">
                    <button
                      type="button"
                      className="si-route-map-panel__secondary"
                      disabled={busy || !startLabel.trim() || !endLabel.trim()}
                      onClick={onSnapEndpoints}
                    >
                      <i className="fa-solid fa-road" aria-hidden />
                      Snap to road network
                    </button>
                  </div>

                  <button
                    type="button"
                    className="si-route-map-panel__primary"
                    disabled={busy || !hasOrsKey || !startLabel.trim() || !endLabel.trim()}
                    onClick={onComputeRoute}
                  >
                    {busy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                        Computing route…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-play" aria-hidden />
                        Show route on map
                      </>
                    )}
                  </button>
                </>
              ) : null}

              {serviceTab === 'isochrone' ? (
                <>
                  <label className="si-route-map-panel__toggle">
                    <input
                      type="checkbox"
                      checked={isochroneEnabled}
                      onChange={e => onIsochroneEnabledChange(e.target.checked)}
                    />
                    <span>Show reachability polygons on map</span>
                  </label>
                  <div className="si-route-map-panel__chips" role="group" aria-label="Time intervals">
                    {ISOCHRONE_PRESETS.map(m => (
                      <button
                        key={m}
                        type="button"
                        className={`si-route-map-panel__chip${isochroneMinutes.includes(m) ? ' is-active' : ''}`}
                        disabled={busy}
                        onClick={() => toggleIsochroneMinute(m)}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`si-route-map-panel__pick si-route-map-panel__pick--block${pickTarget === 'isochrone' ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => onPickTargetChange(pickTarget === 'isochrone' ? null : 'isochrone')}
                  >
                    <i className="fa-solid fa-crosshairs" aria-hidden />
                    Pick center on map
                  </button>
                  <label className="si-route-map-panel__field">
                    <span className="si-route-map-panel__field-k">
                      <i className="fa-solid fa-bullseye" />
                      Center
                    </span>
                    <input
                      type="text"
                      className="si-route-map-panel__input"
                      value={isochroneCenterLabel}
                      onChange={e => onIsochroneCenterLabelChange(e.target.value)}
                      placeholder="Address or lat,lng"
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    className="si-route-map-panel__primary"
                    disabled={busy || !hasOrsKey || !isochroneCenterLabel.trim()}
                    onClick={onComputeIsochrone}
                  >
                    {busy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                        Building isochrones…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-draw-polygon" aria-hidden />
                        Show isochrones on map
                      </>
                    )}
                  </button>
                </>
              ) : null}

              {serviceTab === 'matrix' ? (
                <>
                  <p className="si-route-map-panel__matrix-hint">
                    One location per line: label optional — <code>lat,lng</code> or address.
                  </p>
                  <button
                    type="button"
                    className={`si-route-map-panel__pick si-route-map-panel__pick--block${pickTarget === 'matrix' ? ' is-active' : ''}`}
                    disabled={busy}
                    onClick={() => onPickTargetChange(pickTarget === 'matrix' ? null : 'matrix')}
                  >
                    <i className="fa-solid fa-plus" aria-hidden />
                    Add point from map click
                  </button>
                  <label className="si-route-map-panel__field">
                    <span className="si-route-map-panel__field-k">
                      <i className="fa-solid fa-table" />
                      Locations
                    </span>
                    <textarea
                      className="si-route-map-panel__textarea"
                      rows={5}
                      value={matrixLocationsText}
                      onChange={e => onMatrixLocationsTextChange(e.target.value)}
                      placeholder={'Site A, 49.41, 8.68\n49.42, 8.69\nWarehouse'}
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    className="si-route-map-panel__primary"
                    disabled={busy || !hasOrsKey || matrixLocationsText.trim().split('\n').filter(Boolean).length < 2}
                    onClick={onComputeMatrix}
                  >
                    {busy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                        Computing matrix…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-table" aria-hidden />
                        Compute travel matrix
                      </>
                    )}
                  </button>
                  {matrixCells.length ? (
                    <div className="si-route-map-panel__matrix-wrap">
                      <table className="si-route-map-panel__matrix">
                        <thead>
                          <tr>
                            <th>From</th>
                            <th>To</th>
                            <th>Time</th>
                            <th>Distance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrixCells.map((c, i) => (
                            <tr key={`${c.fromIndex}-${c.toIndex}-${i}`}>
                              <td>{c.fromLabel}</td>
                              <td>{c.toLabel}</td>
                              <td>{c.durationLabel}</td>
                              <td>{c.distanceLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : null}

              {error ? <p className="si-route-map-panel__error">{error}</p> : null}

              {serviceTab === 'route' && active ? (
                <div className="si-route-map-panel__result">
                  <motion.div className="si-route-map-panel__result-main" layout="position">
                    <span className="si-route-map-panel__result-accent" aria-hidden />
                    <motion.div className="si-route-map-panel__result-metrics" layout="position">
                      <strong>{active.durationLabel}</strong>
                      <span>{active.distanceLabel}</span>
                    </motion.div>
                    <span className="si-route-map-panel__result-tags">
                      <span title="ETA">
                        <i className="fa-regular fa-clock" /> ETA
                      </span>
                      {fuelLiters != null && fuelLiters > 0 ? (
                        <span title="Estimated fuel">
                          <i className="fa-solid fa-gas-pump" /> ~{fuelLiters} L
                        </span>
                      ) : null}
                      {session && session.options.length > 1 ? (
                        <span title="Alternative routes">
                          <i className="fa-solid fa-code-branch" /> {session.options.length} paths
                        </span>
                      ) : null}
                    </span>
                  </motion.div>
                </div>
              ) : null}

              {serviceTab === 'route' && elevationProfile.length > 0 ? (
                <SiRouteElevationChart profile={elevationProfile} />
              ) : null}

              {serviceTab === 'route' && turnSteps.length > 0 ? (
                <SiRouteTurnByTurnList
                  steps={turnSteps}
                  activeIndex={navStepIndex}
                  onSelectStep={onNavStepIndexChange}
                />
              ) : null}

              {serviceTab === 'route' && session && onStartNavigation ? (
                <div className="si-route-map-panel__nav-row">
                  {!navigationActive ? (
                    <button
                      type="button"
                      className="si-route-map-panel__primary si-route-map-panel__primary--nav"
                      disabled={busy}
                      onClick={onStartNavigation}
                    >
                      <i className="fa-solid fa-location-arrow" aria-hidden />
                      Start navigation
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="si-route-map-panel__clear"
                      disabled={busy}
                      onClick={onStopNavigation}
                    >
                      <i className="fa-solid fa-stop" aria-hidden />
                      End navigation
                    </button>
                  )}
                  {onVoiceEnabledChange ? (
                    <label className="si-route-map-panel__check-inline">
                      <input
                        type="checkbox"
                        checked={voiceEnabled}
                        onChange={e => onVoiceEnabledChange(e.target.checked)}
                      />
                      Voice guidance
                    </label>
                  ) : null}
                </div>
              ) : null}

              {serviceTab === 'route' && session && session.options.length > 1 ? (
                <ul className="si-route-map-panel__alts">
                  {session.options.map((opt, i) => (
                    <li key={opt.id}>
                      <button
                        type="button"
                        className={`si-route-map-panel__alt${session.selectedIndex === i ? ' is-active' : ''}`}
                        onClick={() => onSelectRouteIndex(i)}
                      >
                        <span>{opt.label}</span>
                        <span>
                          {opt.durationLabel} · {opt.distanceLabel}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <button type="button" className="si-route-map-panel__clear" disabled={busy} onClick={onClearMapLayers}>
                <i className="fa-solid fa-eraser" aria-hidden />
                Clear map routing layers
              </button>

              <footer className="si-route-map-panel__foot">
                <span>Powered by</span>
                <a
                  href="https://github.com/GIScience/openrouteservice"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="si-route-map-panel__gh"
                >
                  OpenRouteService
                </a>
              </footer>
            </motion.div>
          ) : null}
          {!minimized ? (
            <div
              className="si-route-map-panel__resize"
              onPointerDown={onResizePointerDown}
              aria-label="Resize panel"
              title="Resize panel"
            />
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
