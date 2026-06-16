import './satelliteMapAnalysisChrome.css';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type {
  AoiStaticExportLngLat,
  AoiStaticMultiLayerLineChartDataset,
} from './AoiStaticMultiLayerLineChart';
import {
  type StaticAoiChartLayerId,
  type WeeklyCompositeLite,
} from '../utils/staticAoiMultiChartData';
import type { SiAoiRasterPixelSample } from '../utils/siAoiZonalStats';
import type { SiGeoAiIndexAnalyticalExportContext } from '../utils/siGeoAiIndexAnalyticalExport';
import { SatelliteContextualAnalysisDock } from './SatelliteContextualAnalysisDock';
import type { AoiGeometryEditSubTool, MapDrawTool, SiAoiDrawnStats, SiAoiWorkspaceRow } from './aoi/siAoiModuleTypes';
import type { SiAoiSpectralProfileMini } from './AoiSpectralProfileMiniChart';
import type { SmartProcessingSectionId } from './SmartProcessingWorkflowPanel';
/** Optional metadata when opening a processing section from the map toolbox. */
export type MapToolboxNavigateMeta = { fromDockOptions?: boolean };
export type MapToolboxNavigateHandler = (
  sectionId: SmartProcessingSectionId,
  meta?: MapToolboxNavigateMeta,
) => void;
import { MapToolsDock } from './MapToolsDock';
import type { AoiDrawShapeTool, SiMapInteractionMode } from './aoi/siAoiModuleTypes';
import { SiTimelineOptionsModal, type SiTimelineOptions } from './SiTimelineOptionsModal';
import { timelineDateFromIso, timelineIsoToMs } from '../utils/siTimelineDate';
import { pickTimelineStopIdx, pickTimelineStopIsoForRailRatio } from '../utils/siTimelineWeekIndex';
import {
  SI_TIMELINE_SLIDER_MODE_OPTIONS,
  type SiTimeSliderMode,
  type SiTimelineIntervalUnit,
} from '../utils/siTimelineOptions';

const SI_MAP_TIMELINE_POS_LS = 'si-sat-map-timeline-pos-v2';
const SI_MAP_TIMELINE_OFFSET_LS = 'si-sat-map-timeline-offset-v1';

type TimelineViewportPos = { left: number; top: number };

/** Keep the floating bar above the Windows taskbar / mobile home indicator / bottom table dock. */
function readMapBottomReservePx(): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--si-map-bottom-reserve').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function timelineViewportBottomInset(): number {
  if (typeof window === 'undefined') return 88;
  return 88 + readMapBottomReservePx();
}

function defaultTimelineViewportPos(shellHeight = 132): TimelineViewportPos {
  if (typeof window === 'undefined') return { left: 480, top: 520 };
  const bottomInset = timelineViewportBottomInset();
  return {
    left: window.innerWidth * 0.5,
    top: Math.max(72, window.innerHeight - bottomInset - shellHeight),
  };
}

function readStoredTimelineOffset(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(SI_MAP_TIMELINE_OFFSET_LS);
    if (!raw) return { x: 0, y: 0 };
    const o = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = Number(o.x);
    const y = Number(o.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
    return { x, y };
  } catch {
    return { x: 0, y: 0 };
  }
}

function readStoredTimelinePos(): TimelineViewportPos {
  if (typeof window === 'undefined') return defaultTimelineViewportPos();
  try {
    const raw = localStorage.getItem(SI_MAP_TIMELINE_POS_LS);
    if (raw) {
      const o = JSON.parse(raw) as { left?: unknown; top?: unknown };
      const left = Number(o.left);
      const top = Number(o.top);
      if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
    }
  } catch {
    /* ignore */
  }
  const legacy = readStoredTimelineOffset();
  const base = defaultTimelineViewportPos();
  return { left: base.left + legacy.x, top: base.top + legacy.y };
}

function clampTimelinePos(
  left: number,
  top: number,
  size?: { width: number; height: number },
): TimelineViewportPos {
  if (typeof window === 'undefined') return { left, top };
  const pad = 14;
  const w = size?.width ?? 720;
  const h = size?.height ?? 132;
  const halfW = w / 2;
  const bottomInset = timelineViewportBottomInset();
  const maxTop = window.innerHeight - pad - h - bottomInset;
  return {
    left: Math.max(pad + halfW, Math.min(window.innerWidth - pad - halfW, left)),
    top: Math.max(pad, Math.min(maxTop, top)),
  };
}

/** Compact range labels on the scrub rail (avoids crowding full ISO strings). */
function formatTimelineScrubDate(iso: string): string {
  if (!iso) return '—';
  const s = iso.slice(0, 10);
  if (s.length < 10) return s;
  return s.slice(5);
}

function isoToRailFraction(iso: string, rangeStart: string, rangeEnd: string): number {
  const start = rangeStart.slice(0, 10);
  const end = rangeEnd.slice(0, 10);
  if (!start || !end) return 0;
  if (start === end) return 0;
  const a = timelineIsoToMs(start);
  const b = timelineIsoToMs(end);
  const t = timelineIsoToMs(iso.slice(0, 10));
  const span = b - a;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (t - a) / span));
}

const TIMELINE_INTERVAL_UNITS: { value: SiTimelineIntervalUnit; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export type SatelliteMapAnalysisToolbarProps = {
  interactionMode?: SiMapInteractionMode;
  onInteractionMode?: (mode: SiMapInteractionMode) => void;
  drawShape?: AoiDrawShapeTool;
  onDrawShape?: (shape: AoiDrawShapeTool) => void;
  hasMoveSelection?: boolean;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  /** AOI sketch committed or any drawing/edit session active — disables Clear when false */
  hasClearableDrawing?: boolean;
  /** Clear all AOI graphics and drawing state; leaves basemap, WMS imagery, and added map layers intact */
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  aoiTimelineChartsAvailable?: boolean;
  onToggleStaticCharts: () => void;
  /** When true, toolbar sits inside Remote Sensing card (no floating map position). */
  embedded?: boolean;
  /** When true, Charts tab is a compact shortcut (optional). */
  chartsCompact?: boolean;
  className?: string;
  /** Optional — enriches embedded contextual Stats tab */
  weeklyMeans?: number[];
  pivotBars?: Array<{ name: string; value: number }>;
  fieldComparisonBars?: Array<{ name: string; value: number }>;
  fieldComparisonSubtitle?: string;
  spectralProfile?: SiAoiSpectralProfileMini | null;
  indexLabel?: string;
  staticComparisonLayers?: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle?: (id: StaticAoiChartLayerId) => void;
  staticMultiLineLabels?: string[];
  staticMultiLineDatasets?: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst?: boolean;
  /** One WGS84 point per timeline row for chart export (inside AOI when polygon). */
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
  geoAiIndexAnalyticalExportContext?: SiGeoAiIndexAnalyticalExportContext | null;
  onRequestGenerateReport?: () => void;
};

export function SatelliteMapAnalysisToolbar({
  interactionMode = 'view',
  onInteractionMode,
  drawShape = 'polygon',
  onDrawShape,
  hasMoveSelection = false,
  mapTool,
  onMapTool,
  hasClearableDrawing = false,
  onClearDrawing,
  hasAoi,
  staticChartsOpen,
  aoiTimelineChartsAvailable = false,
  onToggleStaticCharts,
  embedded = false,
  chartsCompact = false,
  className = '',
  weeklyMeans = [],
  pivotBars = [],
  fieldComparisonBars,
  fieldComparisonSubtitle = '',
  spectralProfile = null,
  indexLabel = '',
  staticComparisonLayers = [],
  onStaticComparisonLayerToggle,
  staticMultiLineLabels = [],
  staticMultiLineDatasets = [],
  staticMultiLineHasLst = false,
  staticChartExportLngLatPerRow,
  geoAiIndexAnalyticalExportContext = null,
  onRequestGenerateReport,
}: SatelliteMapAnalysisToolbarProps) {
  return (
    <SatelliteContextualAnalysisDock
      variant={embedded ? 'embedded' : 'map'}
      className={[embedded ? 'si-map-analysis-toolbar--embedded' : '', className.trim()].filter(Boolean).join(' ')}
      interactionMode={interactionMode}
      onInteractionMode={onInteractionMode}
      drawShape={drawShape}
      onDrawShape={onDrawShape}
      hasMoveSelection={hasMoveSelection}
      mapTool={mapTool}
      onMapTool={onMapTool}
      hasClearableDrawing={hasClearableDrawing}
      onClearDrawing={onClearDrawing}
      hasAoi={hasAoi}
      staticChartsOpen={staticChartsOpen}
      aoiTimelineChartsAvailable={aoiTimelineChartsAvailable}
      onToggleStaticCharts={onToggleStaticCharts}
      chartsCompact={chartsCompact}
      weeklyMeans={weeklyMeans}
      pivotBars={pivotBars}
      fieldComparisonBars={fieldComparisonBars}
      fieldComparisonSubtitle={fieldComparisonSubtitle}
      spectralProfile={spectralProfile}
      indexLabel={indexLabel}
      staticMultiLineLabels={staticMultiLineLabels}
      staticMultiLineDatasets={staticMultiLineDatasets}
      staticMultiLineHasLst={staticMultiLineHasLst}
      staticChartExportLngLatPerRow={staticChartExportLngLatPerRow}
      geoAiIndexAnalyticalExportContext={geoAiIndexAnalyticalExportContext}
      staticComparisonLayers={staticComparisonLayers}
      onStaticComparisonLayerToggle={onStaticComparisonLayerToggle}
      onRequestGenerateReport={onRequestGenerateReport}
    />
  );
}

export type SiTimelineTransitionMode = 'step' | 'smooth';

export type SatelliteMapAnalysisChromeProps = {
  timelinePlaying: boolean;
  onTogglePlay: () => void;
  onStep: (dir: -1 | 1) => void;
  timelineVisible: boolean;
  /** Milliseconds between automatic steps while timeline is playing (drives interval in parent). */
  timelinePlaybackMs?: number;
  /** Cycle playback speed (parent owns state). */
  onCycleTimelineSpeed?: () => void;
  /** `step` = instant WMS swap; `smooth` = crossfade between dates. */
  timelineTransitionMode?: SiTimelineTransitionMode;
  onTimelineTransitionModeChange?: (mode: SiTimelineTransitionMode) => void;
  /** Active imagery / analysis date (YYYY-MM-DD) — drives the “Selected” readout. */
  selectedImageryDateIso?: string;
  /** Generate Timeline range (panel Start / End) — shown on the timeline bar when chips exist. */
  timelineSeriesStartIso?: string;
  timelineSeriesEndIso?: string;
  /** When true + AOI present, End date on the bar edits the series range for AOI / WMS. */
  timelineEndDateEditable?: boolean;
  onTimelineSeriesEndChange?: (iso: string) => void;
  /** ArcGIS-style time slider options (gear on timeline transport). */
  timelineOptions?: SiTimelineOptions;
  onTimelineOptionsApply?: (next: SiTimelineOptions) => void;
  /** Navigation stops (day/week/month/year); rail ticks snap here. */
  timelineStops?: string[];
  /** Active WMS extent segment for the highlighted rail range. */
  timelineExtentStart?: string;
  timelineExtentEnd?: string;
  onPickTimelineStop?: (iso: string) => void;
  /** Live scrub while dragging the rail (map tiles only; commit on pointer up). */
  onScrubTimelineStop?: (iso: string) => void;
  interactionMode?: SiMapInteractionMode;
  onInteractionMode?: (mode: SiMapInteractionMode) => void;
  drawShape?: AoiDrawShapeTool;
  onDrawShape?: (shape: AoiDrawShapeTool) => void;
  hasMoveSelection?: boolean;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | 'freehand' | string;
  onMapTool: (tool: MapDrawTool) => void;
  hasClearableDrawing?: boolean;
  onClearDrawing?: () => void;
  hasAoi: boolean;
  drawAssistHint?: string;
  hasEditableAoiGeometry?: boolean;
  aoiEditEnabled?: boolean;
  onToggleAoiEdit?: () => void;
  aoiEditSubTool?: AoiGeometryEditSubTool;
  onAoiEditSubTool?: (tool: AoiGeometryEditSubTool) => void;
  aoiEditShowAllVertices?: boolean;
  onToggleAoiEditAllVertices?: () => void;
  multiAoiItems?: SiAoiWorkspaceRow[];
  activeMultiAoiId?: string | null;
  onSelectAoi?: (id: string) => void;
  onRenameAoi?: (id: string, name: string) => void;
  onRemoveAoi?: (id: string) => void;
  aoiDrawnStats?: SiAoiDrawnStats | null;
  fieldTimelineSessionActive?: boolean;
  onAoiGenerateTimeline?: () => void;
  onAoiStopTimeline?: () => void;
  staticChartsOpen: boolean;
  aoiTimelineChartsAvailable?: boolean;
  onToggleStaticCharts: () => void;
  /** @deprecated Map uses contextual dock; flag ignored. */
  showFloatingToolbar?: boolean;
  /** Sparkline means from AOI zonal raster (null gaps when no data). */
  weeklyMeans: (number | null)[];
  pivotBars: Array<{ name: string; value: number }>;
  fieldComparisonBars?: Array<{ name: string; value: number }>;
  fieldComparisonSubtitle?: string;
  spectralProfile?: SiAoiSpectralProfileMini | null;
  indexLabel: string;
  /** Multi-layer temporal line chart (WMS-style indices). */
  staticMultiLineLabels: string[];
  staticMultiLineDatasets: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst: boolean;
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
  geoAiIndexAnalyticalExportContext?: SiGeoAiIndexAnalyticalExportContext | null;
  staticComparisonLayers: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle: (id: StaticAoiChartLayerId) => void;
  onRequestGenerateReport?: () => void;
  scatterAoiFeature?: GeoJSON.Feature | null;
  scatterAoiKey?: string | null;
  scatterWeekly?: WeeklyCompositeLite[];
  scatterWeekIndex?: number;
  scatterRasterSample?: SiAoiRasterPixelSample | null;
  rasterDataLoading?: boolean;
  hasRealRasterData?: boolean;
  /** With `mapLoaded`, portals the contextual dock into `mapboxgl-canvas-container` for a true in-map overlay. */
  mapRef?: RefObject<any>;
  mapLoaded?: boolean;
  /** When false, the right-rail map toolbox is omitted (timeline and other chrome still render). */
  showMapToolbox?: boolean;
  onProcessingWorkflowNavigate?: MapToolboxNavigateHandler;
  processingDropdownOpen?: boolean;
  /** Section shown inside portaled Processing Options — syncs toolbox chrome (title / rail) with content. */
  processingEmbedSection?:
    | 'source'
    | 'layers'
    | 'remote-sensing'
    | 'table-geo-ai'
    | null;
  onMapToolboxEmbedHost?: (el: HTMLDivElement | null) => void;
  onToolboxPanelClose?: () => void;
  /** Layers tool → Main tab: add layer + Added layers (optional; parent provides memoized JSX). */
  mapToolboxLayersMain?: ReactNode;
  /** Layers tool → Options tab: e.g. per-layer popup configuration (optional). */
  mapToolboxLayersOptionsExtra?: ReactNode;
  /** Geo AI opens as a floating map widget (not inside the processing panel). */
  geoAiFloatingOpen?: boolean;
  onGeoAiFloatingRailToggle?: () => void;
  /** Map toolbox rail: opens add layer / data dialog (Satellite Intelligence). */
  onMapToolboxAddData?: () => void;
  /** Fields → Main tab: drawing + spectral strip. */
  fieldsPanelWorkspaceContent?: ReactNode;
  /** Fields → Field Data tab: library + groups. */
  fieldsPanelLibraryContent?: ReactNode;
  /** @deprecated Use `fieldsPanelWorkspaceContent` + `fieldsPanelLibraryContent`. */
  fieldsPanelContent?: ReactNode;
  /** Saved-fields count for the rail badge (0 hides the badge). */
  fieldsCount?: number;
  /** Map toolbox rail: quick open for WMS symbology (classified ramp). */
  mapSymbologyToolbarSlot?: ReactNode;
  /** Spectral / WMS legend on map — toggled from toolbox rail when a legend exists. */
  mapSpectralLegendAvailable?: boolean;
  mapSpectralLegendOpen?: boolean;
  onToggleMapSpectralLegend?: () => void;
  onOpenMapPrint?: () => void;
  routeMapOpen?: boolean;
  onToggleRouteMap?: () => void;
  elevProfileOpen?: boolean;
  onToggleElevProfile?: () => void;
  mapWeatherIntelActive?: boolean;
  onToggleMapWeatherIntel?: () => void;
  quickDashboardOpen?: boolean;
  onToggleQuickDashboard?: () => void;
  exploreIndexesOpen?: boolean;
  onToggleExploreIndexes?: () => void;
  /** When true, map analysis tools cannot open until feature pop-ups are closed. */
  mapAnalysisToolsLockedByPopups?: boolean;
};

function sparkPath(values: readonly (number | null)[], w: number, h: number): string {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return '';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const pts = finite.map((v, i) => {
    const x = finite.length <= 1 ? w / 2 : (i / (finite.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(' L ')}`;
}

export function SatelliteMapAnalysisChrome(props: SatelliteMapAnalysisChromeProps) {
  const timelineRailRef = useRef<HTMLDivElement | null>(null);
  const timelineShellRef = useRef<HTMLDivElement | null>(null);
  const timelinePosRef = useRef<TimelineViewportPos>(readStoredTimelinePos());
  const [timelinePos, setTimelinePos] = useState<TimelineViewportPos>(readStoredTimelinePos);
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [timelineOptionsOpen, setTimelineOptionsOpen] = useState(false);

  timelinePosRef.current = timelinePos;
  const {
    timelinePlaying,
    onTogglePlay,
    onStep,
    timelineVisible,
    timelinePlaybackMs = 1400,
    onCycleTimelineSpeed,
    timelineTransitionMode = 'smooth',
    onTimelineTransitionModeChange,
    selectedImageryDateIso = '',
    timelineSeriesStartIso = '',
    timelineSeriesEndIso = '',
    timelineEndDateEditable = false,
    onTimelineSeriesEndChange,
    timelineOptions,
    onTimelineOptionsApply,
    timelineStops = [],
    timelineExtentStart = '',
    timelineExtentEnd = '',
    onPickTimelineStop,
    onScrubTimelineStop,
    interactionMode = 'view',
    onInteractionMode,
    drawShape = 'polygon',
    onDrawShape,
    hasMoveSelection = false,
    mapTool,
    onMapTool,
    hasClearableDrawing = false,
    onClearDrawing,
    hasAoi,
    drawAssistHint = '',
    hasEditableAoiGeometry = false,
    aoiEditEnabled = false,
    onToggleAoiEdit,
    aoiEditSubTool = 'vertex',
    onAoiEditSubTool,
    aoiEditShowAllVertices = false,
    onToggleAoiEditAllVertices,
    multiAoiItems = [],
    activeMultiAoiId = null,
    onSelectAoi,
    onRenameAoi,
    onRemoveAoi,
    aoiDrawnStats = null,
    fieldTimelineSessionActive = false,
    onAoiGenerateTimeline,
    onAoiStopTimeline,
    staticChartsOpen,
    aoiTimelineChartsAvailable = false,
    onToggleStaticCharts,
    weeklyMeans,
    pivotBars,
    fieldComparisonBars,
    fieldComparisonSubtitle = '',
    spectralProfile = null,
    indexLabel,
    staticMultiLineLabels,
    staticMultiLineDatasets,
    staticMultiLineHasLst,
    staticChartExportLngLatPerRow,
    geoAiIndexAnalyticalExportContext = null,
    staticComparisonLayers,
    onStaticComparisonLayerToggle,
    onRequestGenerateReport,
    scatterAoiFeature = null,
    scatterAoiKey = null,
    scatterWeekly = [],
    scatterWeekIndex = 0,
    scatterRasterSample = null,
    rasterDataLoading = false,
    hasRealRasterData = true,
    mapRef,
    mapLoaded = false,
    showMapToolbox = true,
    onProcessingWorkflowNavigate,
    processingDropdownOpen = false,
    processingEmbedSection = null,
    onMapToolboxEmbedHost,
    onToolboxPanelClose,
    mapToolboxLayersMain,
    mapToolboxLayersOptionsExtra,
    geoAiFloatingOpen = false,
    onGeoAiFloatingRailToggle,
    onMapToolboxAddData,
    fieldsPanelWorkspaceContent,
    fieldsPanelLibraryContent,
    fieldsPanelContent,
    fieldsCount = 0,
    mapSymbologyToolbarSlot,
    mapSpectralLegendAvailable = false,
    mapSpectralLegendOpen = false,
    onToggleMapSpectralLegend,
    onOpenMapPrint,
    routeMapOpen,
    onToggleRouteMap,
    elevProfileOpen,
    onToggleElevProfile,
    mapWeatherIntelActive = false,
    onToggleMapWeatherIntel,
    quickDashboardOpen = false,
    onToggleQuickDashboard,
    exploreIndexesOpen = false,
    onToggleExploreIndexes,
    mapAnalysisToolsLockedByPopups = false,
  } = props;

  const railStops = useMemo(
    () => timelineStops.map(s => s.slice(0, 10)).filter(Boolean),
    [timelineStops],
  );

  const activeFull = selectedImageryDateIso?.slice(0, 10) || railStops[0] || '';

  const seriesStartIso = (timelineSeriesStartIso || railStops[0] || '').slice(0, 10);
  const lastStopIso = railStops[railStops.length - 1] ?? '';
  const seriesEndIso = [timelineSeriesEndIso, lastStopIso]
    .map(s => (s || '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() ?? '';
  const rangeStartLabel = formatTimelineScrubDate(seriesStartIso || railStops[0] || '');
  const rangeEndLabel = formatTimelineScrubDate(seriesEndIso || lastStopIso || '');
  const rangeStartTitle = seriesStartIso || railStops[0] || '';
  const rangeEndTitle = seriesEndIso || lastStopIso || '';

  const thumbIso = activeFull.slice(0, 10);
  const thumbPct = useMemo(
    () => isoToRailFraction(thumbIso, seriesStartIso, seriesEndIso) * 100,
    [thumbIso, seriesStartIso, seriesEndIso],
  );

  const showExtentSegment =
    timelineOptions?.sliderMode !== 'instant' &&
    Boolean(timelineExtentStart && timelineExtentEnd && seriesStartIso && seriesEndIso);

  const segmentStyle = useMemo(() => {
    if (!showExtentSegment) return null;
    const left = isoToRailFraction(timelineExtentStart, seriesStartIso, seriesEndIso) * 100;
    const right = isoToRailFraction(timelineExtentEnd, seriesStartIso, seriesEndIso) * 100;
    const width = Math.max(0.5, right - left);
    return { left: `${left}%`, width: `${width}%` };
  }, [
    showExtentSegment,
    timelineExtentStart,
    timelineExtentEnd,
    seriesStartIso,
    seriesEndIso,
  ]);

  const railSnapHandler = onScrubTimelineStop ?? onPickTimelineStop;
  const railSnapPendingRef = useRef<number | null>(null);
  const railSnapLastIsoRef = useRef('');

  const snapRailToClientX = useCallback(
    (clientX: number, commit: boolean) => {
      if (!railSnapHandler || !railStops.length) return;
      const track = timelineRailRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const best = pickTimelineStopIsoForRailRatio(railStops, ratio);
      if (!best) return;
      if (!commit && best === railSnapLastIsoRef.current) return;
      railSnapLastIsoRef.current = best;
      if (commit) {
        onPickTimelineStop?.(best);
        return;
      }
      railSnapHandler(best);
    },
    [railSnapHandler, onPickTimelineStop, railStops],
  );

  const scheduleRailSnap = useCallback(
    (clientX: number, commit: boolean) => {
      if (commit) {
        if (railSnapPendingRef.current != null) {
          cancelAnimationFrame(railSnapPendingRef.current);
          railSnapPendingRef.current = null;
        }
        snapRailToClientX(clientX, true);
        return;
      }
      if (railSnapPendingRef.current != null) return;
      railSnapPendingRef.current = requestAnimationFrame(() => {
        railSnapPendingRef.current = null;
        snapRailToClientX(clientX, false);
      });
    },
    [snapRailToClientX],
  );

  const onRailPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!railSnapHandler) return;
      e.preventDefault();
      e.stopPropagation();
      const track = e.currentTarget;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      railSnapLastIsoRef.current = '';
      scheduleRailSnap(e.clientX, false);
      const onMove = (ev: PointerEvent) => scheduleRailSnap(ev.clientX, false);
      const finish = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (railSnapPendingRef.current != null) {
          cancelAnimationFrame(railSnapPendingRef.current);
          railSnapPendingRef.current = null;
        }
        scheduleRailSnap(ev.clientX, true);
        try {
          track.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [railSnapHandler, scheduleRailSnap],
  );

  const patchTimelineOptions = useCallback(
    (partial: Partial<SiTimelineOptions>) => {
      if (!timelineOptions || !onTimelineOptionsApply) return;
      onTimelineOptionsApply({ ...timelineOptions, ...partial });
    },
    [timelineOptions, onTimelineOptionsApply],
  );

  const playbackSpeedLabel = useMemo(() => {
    const base = 1400;
    const x = base / Math.max(1, timelinePlaybackMs);
    if (x < 1.12) return '1×';
    if (x < 9.5) return `${x.toFixed(1)}×`;
    return `${Math.round(x)}×`;
  }, [timelinePlaybackMs]);

  const persistTimelinePos = useCallback((pos: TimelineViewportPos) => {
    try {
      localStorage.setItem(SI_MAP_TIMELINE_POS_LS, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, []);

  const measureTimelineSize = useCallback(() => {
    const el = timelineShellRef.current;
    if (!el) return { width: 720, height: 118 };
    const r = el.getBoundingClientRect();
    return { width: r.width || 720, height: r.height || 118 };
  }, []);

  useLayoutEffect(() => {
    const onResize = () => {
      setTimelinePos(prev => clampTimelinePos(prev.left, prev.top, measureTimelineSize()));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureTimelineSize]);

  useLayoutEffect(() => {
    if (!timelineVisible || railStops.length === 0) return;
    const size = measureTimelineSize();
    setTimelinePos(prev => {
      const next = clampTimelinePos(prev.left, prev.top, size);
      if (next.top === prev.top) return prev;
      persistTimelinePos(next);
      return next;
    });
  }, [timelineVisible, railStops.length, measureTimelineSize, persistTimelinePos]);

  const onTimelineDragHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = timelinePosRef.current;
      const start = { left: cur.left, top: cur.top, cx: e.clientX, cy: e.clientY };
      setTimelineDragging(true);
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev: PointerEvent) => {
        const size = measureTimelineSize();
        setTimelinePos(
          clampTimelinePos(
            start.left + (ev.clientX - start.cx),
            start.top + (ev.clientY - start.cy),
            size,
          ),
        );
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        setTimelineDragging(false);
        setTimelinePos(prev => {
          const c = clampTimelinePos(prev.left, prev.top, measureTimelineSize());
          persistTimelinePos(c);
          return c;
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [measureTimelineSize, persistTimelinePos],
  );

  const onTimelineDragHandleDoubleClick = useCallback(() => {
    const size = measureTimelineSize();
    const c = defaultTimelineViewportPos(size.height);
    setTimelinePos(c);
    persistTimelinePos(c);
  }, [measureTimelineSize, persistTimelinePos]);

  const contextualDock = showMapToolbox ? (
    <SatelliteContextualAnalysisDock
      variant="map"
      interactionMode={interactionMode}
      onInteractionMode={onInteractionMode}
      drawShape={drawShape}
      onDrawShape={onDrawShape}
      hasMoveSelection={hasMoveSelection}
      mapTool={mapTool}
      onMapTool={onMapTool}
      hasClearableDrawing={hasClearableDrawing}
      onClearDrawing={onClearDrawing}
      hasAoi={hasAoi}
      staticChartsOpen={staticChartsOpen}
      aoiTimelineChartsAvailable={aoiTimelineChartsAvailable}
      onToggleStaticCharts={onToggleStaticCharts}
      indexLabel={indexLabel}
      staticMultiLineLabels={staticMultiLineLabels}
      staticMultiLineDatasets={staticMultiLineDatasets}
      staticMultiLineHasLst={staticMultiLineHasLst}
      staticChartExportLngLatPerRow={staticChartExportLngLatPerRow}
      geoAiIndexAnalyticalExportContext={geoAiIndexAnalyticalExportContext}
      staticComparisonLayers={staticComparisonLayers}
      onStaticComparisonLayerToggle={onStaticComparisonLayerToggle}
      onRequestGenerateReport={onRequestGenerateReport}
      scatterAoiFeature={scatterAoiFeature}
      scatterAoiKey={scatterAoiKey}
      scatterWeekly={scatterWeekly}
      scatterWeekIndex={scatterWeekIndex}
      scatterRasterSample={scatterRasterSample}
      rasterDataLoading={rasterDataLoading}
      hasRealRasterData={hasRealRasterData}
      weeklyMeans={weeklyMeans}
      pivotBars={pivotBars}
      fieldComparisonBars={fieldComparisonBars}
      fieldComparisonSubtitle={fieldComparisonSubtitle}
      spectralProfile={spectralProfile}
      sparkPathBuilder={sparkPath}
      onProcessingWorkflowNavigate={onProcessingWorkflowNavigate}
      processingDropdownOpen={processingDropdownOpen}
      processingEmbedSection={processingEmbedSection}
      onMapToolboxEmbedHost={onMapToolboxEmbedHost}
      onToolboxPanelClose={onToolboxPanelClose}
      mapToolboxLayersMain={mapToolboxLayersMain}
      mapToolboxLayersOptionsExtra={mapToolboxLayersOptionsExtra}
      geoAiFloatingOpen={geoAiFloatingOpen}
      onGeoAiFloatingRailToggle={onGeoAiFloatingRailToggle}
      onMapToolboxAddData={onMapToolboxAddData}
      fieldsPanelWorkspaceContent={fieldsPanelWorkspaceContent}
      fieldsPanelLibraryContent={fieldsPanelLibraryContent}
      fieldsPanelContent={fieldsPanelContent}
      fieldsCount={fieldsCount}
      mapSymbologyToolbarSlot={mapSymbologyToolbarSlot}
      mapSpectralLegendAvailable={mapSpectralLegendAvailable}
      mapSpectralLegendOpen={mapSpectralLegendOpen}
      onToggleMapSpectralLegend={onToggleMapSpectralLegend}
      onOpenMapPrint={onOpenMapPrint}
      routeMapOpen={routeMapOpen}
      onToggleRouteMap={onToggleRouteMap}
      elevProfileOpen={elevProfileOpen}
      onToggleElevProfile={onToggleElevProfile}
      mapWeatherIntelActive={mapWeatherIntelActive}
      onToggleMapWeatherIntel={onToggleMapWeatherIntel}
      quickDashboardOpen={quickDashboardOpen}
      onToggleQuickDashboard={onToggleQuickDashboard}
      exploreIndexesOpen={exploreIndexesOpen}
      onToggleExploreIndexes={onToggleExploreIndexes}
      mapAnalysisToolsLockedByPopups={mapAnalysisToolsLockedByPopups}
      drawAssistHint={drawAssistHint}
      hasEditableAoiGeometry={hasEditableAoiGeometry}
      aoiEditEnabled={aoiEditEnabled}
      onToggleAoiEdit={onToggleAoiEdit}
      aoiEditSubTool={aoiEditSubTool}
      onAoiEditSubTool={onAoiEditSubTool}
      aoiEditShowAllVertices={aoiEditShowAllVertices}
      onToggleAoiEditAllVertices={onToggleAoiEditAllVertices}
      multiAoiItems={multiAoiItems}
      activeMultiAoiId={activeMultiAoiId}
      onSelectAoi={onSelectAoi}
      onRenameAoi={onRenameAoi}
      onRemoveAoi={onRemoveAoi}
      aoiDrawnStats={aoiDrawnStats}
      fieldTimelineSessionActive={fieldTimelineSessionActive}
      onAoiGenerateTimeline={onAoiGenerateTimeline}
      onAoiStopTimeline={onAoiStopTimeline}
    />
  ) : null;

  return (
    <>
      {timelineVisible && railStops.length > 0 ? (
        <div
          ref={timelineShellRef}
          className={[
            'si-map-analysis-timeline si-timeline',
            timelineDragging ? 'si-map-analysis-timeline--dragging' : '',
            fieldTimelineSessionActive ? 'si-map-analysis-timeline--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="region"
          aria-label="Imagery timeline"
          style={{
            left: timelinePos.left,
            top: timelinePos.top,
          }}
        >
          <div className="si-map-analysis-timeline-inner si-map-analysis-timeline-inner--eo">
            <button
              type="button"
              className="si-map-analysis-timeline-grip"
              aria-label="Drag timeline — double-click to reset position"
              title="Drag · double-click reset"
              aria-grabbed={timelineDragging}
              onPointerDown={onTimelineDragHandlePointerDown}
              onDoubleClick={onTimelineDragHandleDoubleClick}
            >
              <i className="fa-solid fa-grip-vertical" aria-hidden />
            </button>
            <div className="si-map-analysis-timeline-transport">
              <button
                type="button"
                className="si-map-analysis-tl-btn"
                aria-label="Previous period"
                onClick={() => onStep(-1)}
              >
                <i className="fa-solid fa-backward-step" aria-hidden />
              </button>
              <button
                type="button"
                data-si-timeline-play
                className={`si-map-analysis-tl-play ${timelinePlaying ? 'si-map-analysis-tl-play--on' : ''}`}
                aria-label={timelinePlaying ? 'Pause timeline' : 'Play timeline'}
                aria-pressed={timelinePlaying}
                onClick={e => {
                  e.stopPropagation();
                  onTogglePlay();
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                <i className={timelinePlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} aria-hidden />
              </button>
              <button type="button" className="si-map-analysis-tl-btn" aria-label="Next period" onClick={() => onStep(1)}>
                <i className="fa-solid fa-forward-step" aria-hidden />
              </button>
              {timelineOptions && onTimelineOptionsApply ? (
                <button
                  type="button"
                  className="si-map-analysis-tl-btn si-map-analysis-tl-settings"
                  aria-label="Time slider options"
                  title="Time slider options"
                  onClick={e => {
                    e.stopPropagation();
                    setTimelineOptionsOpen(true);
                  }}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <i className="fa-solid fa-gear" aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="si-map-analysis-timeline-track-wrap">
              {timelineOptions && onTimelineOptionsApply ? (
                <div className="si-map-analysis-timeline-mode-row" role="group" aria-label="Time slider mode and interval">
                  <label className="si-map-analysis-timeline-inline-field">
                    <span className="si-map-analysis-timeline-inline-k">Mode</span>
                    <select
                      className="si-map-analysis-timeline-inline-select"
                      value={timelineOptions.sliderMode}
                      title={
                        SI_TIMELINE_SLIDER_MODE_OPTIONS.find(o => o.value === timelineOptions.sliderMode)?.hint
                      }
                      onChange={e =>
                        patchTimelineOptions({ sliderMode: e.target.value as SiTimeSliderMode })
                      }
                    >
                      {SI_TIMELINE_SLIDER_MODE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="si-map-analysis-timeline-inline-field">
                    <span className="si-map-analysis-timeline-inline-k">Unit</span>
                    <select
                      className="si-map-analysis-timeline-inline-select"
                      value={timelineOptions.intervalUnit}
                      onChange={e =>
                        patchTimelineOptions({
                          intervalUnit: e.target.value as SiTimelineIntervalUnit,
                        })
                      }
                    >
                      {TIMELINE_INTERVAL_UNITS.map(u => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="si-map-analysis-timeline-scrub">
                <button
                  type="button"
                  className="si-map-analysis-tl-nudge"
                  aria-label="Step timeline backward (rail)"
                  onClick={() => onStep(-1)}
                >
                  <i className="fa-solid fa-chevron-left" aria-hidden />
                </button>
                <div className="si-map-analysis-timeline-scrub-core">
                  <span className="si-map-analysis-timeline-range-edge" title={rangeStartTitle}>
                    {rangeStartLabel || '—'}
                  </span>
                  <div
                    ref={timelineRailRef}
                    className="si-map-analysis-timeline-rail"
                    role="slider"
                    aria-valuemin={0}
                    aria-valuemax={Math.max(0, railStops.length - 1)}
                    aria-valuenow={pickTimelineStopIdx(railStops, thumbIso)}
                    aria-valuetext={thumbIso || 'Timeline focus'}
                    aria-label="Imagery time slider"
                    onPointerDown={onRailPointerDown}
                  >
                    <div className="si-map-analysis-timeline-rail-track" aria-hidden />
                    {railStops.map((stop, i) => {
                      const pct = isoToRailFraction(stop, seriesStartIso, seriesEndIso) * 100;
                      const isMajor = i === 0 || i === railStops.length - 1 || i % Math.max(1, Math.ceil(railStops.length / 12)) === 0;
                      return (
                        <span
                          key={`${stop}-${i}`}
                          className={`si-map-analysis-timeline-rail-tick ${isMajor ? 'si-map-analysis-timeline-rail-tick--major' : ''}`}
                          style={{ left: `${pct}%` }}
                          aria-hidden
                        />
                      );
                    })}
                    {segmentStyle ? (
                      <div
                        className="si-map-analysis-timeline-rail-segment"
                        style={segmentStyle}
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className="si-map-analysis-timeline-rail-thumb"
                      style={{ left: `${thumbPct}%` }}
                      aria-hidden
                    />
                  </div>
                  <span className="si-map-analysis-timeline-range-edge" title={rangeEndTitle}>
                    {rangeEndLabel || '—'}
                  </span>
                </div>
                <button
                  type="button"
                  className="si-map-analysis-tl-nudge"
                  aria-label="Step timeline forward (rail)"
                  onClick={() => onStep(1)}
                >
                  <i className="fa-solid fa-chevron-right" aria-hidden />
                </button>
              </div>
            </div>

            <div className="si-map-analysis-timeline-meta">
              <div className="si-map-analysis-timeline-date-block">
                <span className="si-map-analysis-timeline-date-label">Selected</span>
                <time className="si-map-analysis-timeline-date" dateTime={activeFull || undefined} title={activeFull}>
                  {activeFull || '—'}
                </time>
              </div>
              {seriesEndIso ? (
                <div
                  className={[
                    'si-map-analysis-timeline-date-block',
                    timelineEndDateEditable && hasAoi ? 'si-map-analysis-timeline-date-block--editable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="si-map-analysis-timeline-date-label">End date</span>
                  {timelineEndDateEditable && hasAoi && onTimelineSeriesEndChange ? (
                    <input
                      type="date"
                      className="si-map-analysis-timeline-date-input si-map-analysis-timeline-date-input--end"
                      value={seriesEndIso}
                      min={seriesStartIso || undefined}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => onTimelineSeriesEndChange(e.target.value)}
                      aria-label="Timeline end date — updates AOI imagery range"
                      title={
                        seriesStartIso
                          ? `AOI series ${seriesStartIso} → ${seriesEndIso}`
                          : 'Adjust end of AOI time series'
                      }
                    />
                  ) : (
                    <time
                      className="si-map-analysis-timeline-date si-map-analysis-timeline-date--end"
                      dateTime={seriesEndIso}
                      title={
                        !hasAoi
                          ? 'Draw an AOI and generate the timeline to edit the end date'
                          : seriesStartIso
                            ? `${seriesStartIso} → ${seriesEndIso}`
                            : seriesEndIso
                      }
                    >
                      {seriesEndIso}
                    </time>
                  )}
                </div>
              ) : null}
              <div className="si-map-analysis-timeline-meta-actions">
                {onTimelineTransitionModeChange ? (
                  <div
                    className="si-map-analysis-tl-transition"
                    role="group"
                    aria-label="Map transition mode"
                  >
                    <button
                      type="button"
                      className={`si-map-analysis-tl-transition-btn ${timelineTransitionMode === 'step' ? 'si-map-analysis-tl-transition-btn--on' : ''}`}
                      aria-pressed={timelineTransitionMode === 'step'}
                      title="Step — instant update per date (legacy flicker)"
                      onClick={() => onTimelineTransitionModeChange('step')}
                    >
                      Step
                    </button>
                    <button
                      type="button"
                      className={`si-map-analysis-tl-transition-btn ${timelineTransitionMode === 'smooth' ? 'si-map-analysis-tl-transition-btn--on' : ''}`}
                      aria-pressed={timelineTransitionMode === 'smooth'}
                      title="Smooth — crossfade between timeline dates"
                      onClick={() => onTimelineTransitionModeChange('smooth')}
                    >
                      Smooth
                    </button>
                  </div>
                ) : null}
                {onCycleTimelineSpeed ? (
                  <button
                    type="button"
                    className="si-map-analysis-tl-speed"
                    title={`Playback interval ${timelinePlaybackMs} ms — click to change speed`}
                    aria-label={`Playback speed ${playbackSpeedLabel}, click to cycle`}
                    onClick={onCycleTimelineSpeed}
                  >
                    {playbackSpeedLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {timelineOptions && onTimelineOptionsApply ? (
        <SiTimelineOptionsModal
          open={timelineOptionsOpen}
          onClose={() => setTimelineOptionsOpen(false)}
          value={timelineOptions}
          onApply={next => {
            onTimelineOptionsApply(next);
            setTimelineOptionsOpen(false);
          }}
        />
      ) : null}

      {/* si-map-container: MapGL + chrome; MapToolsDock portals into mapboxgl-canvas-container */}
      {contextualDock ? (
        mapRef ? (
          <MapToolsDock mapRef={mapRef} mapLoaded={mapLoaded}>
            {contextualDock}
          </MapToolsDock>
        ) : (
          contextualDock
        )
      ) : null}
    </>
  );
}
