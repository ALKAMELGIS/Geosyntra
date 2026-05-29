import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '@/lib/i18n';
import type { AoiStaticExportLngLat, AoiStaticMultiLayerLineChartDataset } from './AoiStaticMultiLayerLineChart';
import { AoiStaticMultiLayerLineChart } from './AoiStaticMultiLayerLineChart';
import {
  AoiSpectralProfileMiniChart,
  type SiAoiSpectralProfileMini,
} from './AoiSpectralProfileMiniChart';
import { StaticAoiComparisonLayerToolbar } from './StaticAoiComparisonLayerToolbar';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from '../utils/staticAoiMultiChartData';
import type { SiAoiRasterPixelSample } from '../utils/siAoiZonalStats';
import type { SiGeoAiIndexAnalyticalExportContext } from '../utils/siGeoAiIndexAnalyticalExport';
import type { SmartProcessingSectionId } from './SmartProcessingWorkflowPanel';
import { SiChatAiAgentIcon } from './SiChatAiAgentIcon';
import { formatStatFixed } from '../utils/weeklyCompositeStats';
import { SiAoiObjectsPanel } from './aoi/SiAoiObjectsPanel';
import type { AoiGeometryEditSubTool, MapDrawTool, SiAoiDrawnStats, SiAoiWorkspaceRow } from './aoi/siAoiModuleTypes';

export type SatelliteContextPanelId =
  | 'layers'
  | 'explore-stac'
  | 'remote-sensing'
  | 'ai-detection-gis'
  | 'table-geo-ai'
  | 'fields'
  | 'spatial'
  | 'aoi'
  | 'charts'
  | 'stats'
  | 'weather'
  | 'raster'
  | 'feature';

export type SatelliteContextDockVariant = 'map' | 'embedded';

export type SatelliteContextualAnalysisDockProps = {
  variant: SatelliteContextDockVariant;
  /** When true, Charts tab shows a shortcut instead of the full chart (e.g. narrow embedded host). */
  chartsCompact?: boolean;
  className?: string;
  interactionMode?: import('./aoi/siAoiModuleTypes').SiMapInteractionMode;
  onInteractionMode?: (mode: import('./aoi/siAoiModuleTypes').SiMapInteractionMode) => void;
  drawShape?: import('./aoi/siAoiModuleTypes').AoiDrawShapeTool;
  onDrawShape?: (shape: import('./aoi/siAoiModuleTypes').AoiDrawShapeTool) => void;
  hasMoveSelection?: boolean;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | 'freehand' | string;
  onMapTool: (tool: MapDrawTool) => void;
  hasClearableDrawing?: boolean;
  onClearDrawing?: () => void;
  hasAoi: boolean;
  drawAssistHint?: string;
  multiAoiItems?: SiAoiWorkspaceRow[];
  activeMultiAoiId?: string | null;
  onSelectAoi?: (id: string) => void;
  onRenameAoi?: (id: string, name: string) => void;
  onRemoveAoi?: (id: string) => void;
  aoiDrawnStats?: SiAoiDrawnStats | null;
  fieldTimelineSessionActive?: boolean;
  onAoiGenerateTimeline?: () => void;
  onAoiStopTimeline?: () => void;
  hasEditableAoiGeometry?: boolean;
  aoiEditEnabled?: boolean;
  onToggleAoiEdit?: () => void;
  aoiEditSubTool?: AoiGeometryEditSubTool;
  onAoiEditSubTool?: (tool: AoiGeometryEditSubTool) => void;
  aoiEditShowAllVertices?: boolean;
  onToggleAoiEditAllVertices?: () => void;
  staticChartsOpen: boolean;
  /** True after Generate timeline — map chart button opens timeline panel only. */
  aoiTimelineChartsAvailable?: boolean;
  onToggleStaticCharts: () => void;
  indexLabel?: string;
  staticMultiLineLabels?: string[];
  staticMultiLineDatasets?: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst?: boolean;
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
  /** Polygon AOI + weekly means — enables multi-sheet GeoAI Excel export from the static chart. */
  geoAiIndexAnalyticalExportContext?: SiGeoAiIndexAnalyticalExportContext | null;
  scatterAoiFeature?: GeoJSON.Feature | null;
  scatterAoiKey?: string | null;
  scatterWeekly?: WeeklyCompositeLite[];
  scatterWeekIndex?: number;
  scatterRasterSample?: SiAoiRasterPixelSample | null;
  staticComparisonLayers?: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle?: (id: StaticAoiChartLayerId) => void;
  weeklyMeans?: number[];
  /** @deprecated No longer used for Stats bars — pass [] or omit. */
  pivotBars?: Array<{ name: string; value: number }>;
  /** When set (e.g. saved fields + AOI sketch fields), Stats bar chart compares fields for primary layer + selected week. */
  fieldComparisonBars?: Array<{ name: string; value: number }>;
  fieldComparisonSubtitle?: string;
  spectralProfile?: SiAoiSpectralProfileMini | null;
  sparkPathBuilder?: (values: number[], w: number, h: number) => string;
  /** Map toolbox: opens the same processing stack as Satellite Intelligence (no reload). */
  onProcessingWorkflowNavigate?: (sectionId: SmartProcessingSectionId, meta?: { fromDockOptions?: boolean }) => void;
  /** When true, the dock panel body hosts the floating Processing Options UI (portal target). */
  processingDropdownOpen?: boolean;
  /**
   * Active section inside the portaled Processing Options (matches parent `expandedEnvSection`).
   * Keeps toolbox header and rail highlight aligned with Explore STAC / RS / AI — not stuck on Layers.
   */
  processingEmbedSection?:
    | 'source'
    | 'layers'
    | 'explore-stac'
    | 'remote-sensing'
    | 'ai-detection-gis'
    | 'table-geo-ai'
    | null;
  /** Called with the embed host element whenever the map panel mounts/updates; null when unmounted. */
  onMapToolboxEmbedHost?: (el: HTMLDivElement | null) => void;
  /** Close the floating processing dropdown (e.g. when the toolbox panel closes). */
  onToolboxPanelClose?: () => void;
  /** Map toolbox Layers → Main tab: add layer + Added layers list (same as Processing Options). */
  mapToolboxLayersMain?: ReactNode;
  /** Map toolbox Layers → Options tab: advanced tools (e.g. popup configuration). */
  mapToolboxLayersOptionsExtra?: ReactNode;
  /** Geo AI floating widget visibility — keeps rail highlight without opening the processing stack. */
  geoAiFloatingOpen?: boolean;
  /** Toggle Geo AI floating widget from the map toolbox rail (same button as highlight). */
  onGeoAiFloatingRailToggle?: () => void;
  /** Map toolbox only: quick action above Layers — open add-data / add-layer flow. */
  onMapToolboxAddData?: () => void;
  /**
   * Fields Data — Main tab: drawing workspace + spectral context (parent
   * supplies memoized `<FieldsPanel layout="workspace" …/>`).
   */
  fieldsPanelWorkspaceContent?: ReactNode;
  /**
   * Fields Data → Field Data tab: library, groups, list (parent supplies
   * `<FieldsPanel layout="library" …/>`). Falls back to `fieldsPanelContent`
   * when omitted for backwards compatibility.
   */
  fieldsPanelLibraryContent?: ReactNode;
  /**
   * @deprecated Prefer `fieldsPanelWorkspaceContent` + `fieldsPanelLibraryContent`.
   * When the new slots are omitted, this still renders on the Main tab only.
   */
  fieldsPanelContent?: ReactNode;
  /**
   * Saved-fields count for the rail badge. Follows the same convention
   * as the GIS Map's `gis-sidebar-rail-btn__badge`: only renders when > 0,
   * so users see "you already have N fields" without needing to open the
   * panel.
   */
  fieldsCount?: number;
  onRequestGenerateReport?: () => void;
  /** Map toolbox rail: optional symbology shortcut (parent supplies a small icon button). */
  mapSymbologyToolbarSlot?: ReactNode;
  /** When true, map toolbox shows a rail control to toggle the on-map spectral / WMS legend overlay. */
  mapSpectralLegendAvailable?: boolean;
  /** Parent-owned visibility for the spectral legend card on the map canvas. */
  mapSpectralLegendOpen?: boolean;
  onToggleMapSpectralLegend?: () => void;
  /** Map toolbox rail: open print preview / PDF export. */
  onOpenMapPrint?: () => void;
  /** GraphHopper Route Map — street routing panel on map canvas. */
  routeMapOpen?: boolean;
  onToggleRouteMap?: () => void;
  /** Open-Meteo weather intelligence at map point / feature / search. */
  mapWeatherIntelActive?: boolean;
  onToggleMapWeatherIntel?: () => void;
};

const RAIL: Array<{ id: SatelliteContextPanelId; icon: string; label: string; title: string; hint: string }> = [
  {
    id: 'layers',
    icon: 'fa-solid fa-layer-group',
    label: 'Layers',
    title: 'Layer settings',
    hint: 'Opacity, ordering, and imagery context while mapping.',
  },
  {
    id: 'explore-stac',
    icon: 'fa-solid fa-magnifying-glass-chart',
    label: 'Explore STAC',
    title: 'Explore STAC',
    hint: 'Catalog search, collections, and items on the map.',
  },
  {
    id: 'remote-sensing',
    icon: 'fa-solid fa-satellite-dish',
    label: 'Remote sensing',
    title: 'Remote sensing',
    hint: 'Indices, WMS layers, timeline, and AOI tools.',
  },
  {
    id: 'ai-detection-gis',
    icon: 'fa-solid fa-magnifying-glass-location',
    label: 'AI Detection in GIS',
    title: 'AI Detection in GIS',
    hint: 'Map-aware detection and inspect workflows.',
  },
  {
    id: 'table-geo-ai',
    icon: 'fa-solid fa-comments',
    label: 'Agent Chat',
    title: 'Agent Chat',
    hint: 'Spatial copilot, attributes, and SQL-style prompts.',
  },
  {
    /* Fields Data — OneSoil-style AOI store. Same icon family ("vector
     * square") the GIS Map sidebar rail uses for parity, and the panel
     * mirrors that GIS Map design 1:1 so the user gets the same drawer
     * experience across both surfaces. */
    id: 'fields',
    icon: 'fa-solid fa-vector-square',
    label: 'Fields Data',
    title: 'Fields Data',
    hint: '',
  },
  {
    id: 'spatial',
    icon: 'fa-solid fa-vector-square',
    label: 'Analysis',
    title: 'Spatial analysis',
    hint: 'Zonal summaries and AOI-scoped workflows.',
  },
  {
    id: 'aoi',
    icon: 'fa-solid fa-draw-polygon',
    label: 'AOI',
    title: 'Objects of Interest (AOI)',
    hint: 'Draw, edit, and manage analysis extents — separate from layers and timeline.',
  },
  {
    id: 'charts',
    icon: 'fa-solid fa-chart-column',
    label: 'Charts',
    title: 'Charts',
    hint: 'Timeline charts and comparison indices.',
  },
  {
    id: 'stats',
    icon: 'fa-solid fa-chart-pie',
    label: 'Statistics',
    title: 'Statistics',
    hint: 'Sparkline, bars, and mix summaries for the AOI.',
  },
  {
    id: 'weather',
    icon: 'fa-solid fa-cloud-sun',
    label: 'Weather',
    title: 'Weather data',
    hint: 'Forecasts and context near the map or AOI.',
  },
  {
    id: 'raster',
    icon: 'fa-solid fa-image',
    label: 'Imagery',
    title: 'Raster controls',
    hint: 'Dates, WMS layer, and playback in Remote Sensing.',
  },
  {
    id: 'feature',
    icon: 'fa-solid fa-circle-info',
    label: 'Feature info',
    title: 'Feature information',
    hint: 'Identify results and attribute tables.',
  },
];

const RAIL_GROUPS: SatelliteContextPanelId[][] = [
  ['layers', 'spatial', 'aoi'],
  ['charts', 'stats', 'weather'],
  ['raster', 'feature'],
];

/** In-map toolbox: Main (layers + STAC + RS) and Options (AI GIS + Geo AI). */
const RAIL_MAP_TOOLBOX_IDS = new Set<SatelliteContextPanelId>([
  'layers',
  'explore-stac',
  'remote-sensing',
  'ai-detection-gis',
  'table-geo-ai',
]);

/** Rail tools that open the floating processing stack instead of the docked panel. */
const MAP_RAIL_FLOAT_IDS = new Set<SatelliteContextPanelId>([
  'explore-stac',
  'remote-sensing',
  'ai-detection-gis',
]);

const RAIL_GROUPS_MAP: SatelliteContextPanelId[][] = [
  ['layers', 'explore-stac'],
  ['remote-sensing', 'ai-detection-gis', 'table-geo-ai'],
];

const RAIL_BY_ID = RAIL.reduce(
  (acc, r) => {
    acc[r.id] = r
    return acc
  },
  {} as Record<SatelliteContextPanelId, (typeof RAIL)[number]>,
);

function SatelliteDockRailGlyph({ id, icon }: { id: SatelliteContextPanelId; icon: string }) {
  if (id === 'table-geo-ai') {
    return <SiChatAiAgentIcon size="rail" />;
  }
  return <i className={icon} aria-hidden />;
}

function defaultSparkPath(values: number[], w: number, h: number): string {
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

export function SatelliteContextualAnalysisDock(props: SatelliteContextualAnalysisDockProps) {
  const { direction, language } = useLanguage();
  const {
    variant,
    className = '',
    mapTool,
    onMapTool,
    hasClearableDrawing = false,
    onClearDrawing,
    hasAoi,
    drawAssistHint = '',
    multiAoiItems = [],
    activeMultiAoiId = null,
    onSelectAoi,
    onRenameAoi,
    onRemoveAoi,
    aoiDrawnStats = null,
    fieldTimelineSessionActive = false,
    onAoiGenerateTimeline,
    onAoiStopTimeline,
    hasEditableAoiGeometry = false,
    aoiEditEnabled = false,
    onToggleAoiEdit,
    aoiEditSubTool = 'vertex',
    onAoiEditSubTool,
    aoiEditShowAllVertices = false,
    onToggleAoiEditAllVertices,
    staticChartsOpen,
    aoiTimelineChartsAvailable = false,
    onToggleStaticCharts,
    chartsCompact = false,
    indexLabel = '',
    staticMultiLineLabels = [],
    staticMultiLineDatasets = [],
    staticMultiLineHasLst = false,
    staticChartExportLngLatPerRow,
    geoAiIndexAnalyticalExportContext = null,
    scatterAoiFeature = null,
    scatterAoiKey = null,
    scatterWeekly = [],
    scatterWeekIndex = 0,
    scatterRasterSample = null,
    staticComparisonLayers = [],
    onStaticComparisonLayerToggle,
    weeklyMeans = [],
    pivotBars: _pivotBarsLegacy = [],
    fieldComparisonBars,
    fieldComparisonSubtitle = '',
    spectralProfile = null,
    sparkPathBuilder = defaultSparkPath,
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
    onRequestGenerateReport,
    mapSymbologyToolbarSlot,
    mapSpectralLegendAvailable = false,
    mapSpectralLegendOpen = false,
    onToggleMapSpectralLegend,
    onOpenMapPrint,
    routeMapOpen = false,
    onToggleRouteMap,
    mapWeatherIntelActive = false,
    onToggleMapWeatherIntel,
  } = props;

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeId, setActiveId] = useState<SatelliteContextPanelId | null>(null);
  const [dockMode, setDockMode] = useState<'dock' | 'float'>(() => {
    try {
      const v = localStorage.getItem('si-sat-ctx-dock-mode');
      return v === 'float' ? 'float' : 'dock';
    } catch {
      return 'dock';
    }
  });
  const [surface, setSurface] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('si-sat-ctx-surface') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem('si-sat-ctx-panel-w'));
      if (Number.isFinite(n) && n >= 260 && n <= 560) return n;
    } catch {
      /* ignore */
    }
    return variant === 'embedded' ? Math.min(340, typeof window !== 'undefined' ? window.innerWidth - 48 : 340) : 340;
  });
  const [innerTab, setInnerTab] = useState<string>('main');
  const [railLabeled, setRailLabeled] = useState(() => {
    try {
      return localStorage.getItem('si-sat-ctx-rail-labeled') !== '0';
    } catch {
      return true;
    }
  });
  /** Map variant: hide entire toolbox to map edge (reopen tab). */
  const [mapStripHidden, setMapStripHidden] = useState(() => {
    try {
      return localStorage.getItem('si-sat-map-ctx-strip-hidden') === '1';
    } catch {
      return false;
    }
  });
  /** Map variant: expanded rail shows labels + wide targets; collapsed = icons + tooltips (ArcGIS-style). */
  const [mapRailLabeled, setMapRailLabeled] = useState(() => {
    try {
      return localStorage.getItem('si-sat-map-ctx-rail-labeled') === '1';
    } catch {
      return false;
    }
  });
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const lastActiveRef = useRef<SatelliteContextPanelId>('layers');
  /** When minimizing the map toolbox strip, remember label mode so restoring the strip does not reset it. */
  const mapRailLabeledBeforeStripHideRef = useRef<boolean | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('si-sat-ctx-dock-mode', dockMode);
    } catch {
      /* ignore */
    }
  }, [dockMode]);

  useEffect(() => {
    try {
      localStorage.setItem('si-sat-ctx-surface', surface);
    } catch {
      /* ignore */
    }
  }, [surface]);

  useEffect(() => {
    try {
      localStorage.setItem('si-sat-ctx-panel-w', String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth]);

  useEffect(() => {
    if (variant === 'map') return;
    try {
      localStorage.setItem('si-sat-ctx-rail-labeled', railLabeled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [railLabeled, variant]);

  useEffect(() => {
    if (variant !== 'map') return;
    try {
      localStorage.setItem('si-sat-map-ctx-strip-hidden', mapStripHidden ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mapStripHidden, variant]);

  useEffect(() => {
    if (variant !== 'map') return;
    try {
      localStorage.setItem('si-sat-map-ctx-rail-labeled', mapRailLabeled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mapRailLabeled, variant]);

  const isMapVariant = variant === 'map';
  const railMenuGroups = useMemo(
    () => (isMapVariant ? RAIL_GROUPS_MAP : RAIL_GROUPS),
    [isMapVariant],
  );

  useEffect(() => {
    if (!isMapVariant) return;
    if (activeId && !RAIL_MAP_TOOLBOX_IDS.has(activeId)) {
      setPanelOpen(false);
      setActiveId(null);
    }
  }, [isMapVariant, activeId]);

  useEffect(() => {
    if (!isMapVariant) return;
    if (processingDropdownOpen) return;
    if (activeId && MAP_RAIL_FLOAT_IDS.has(activeId)) {
      setPanelOpen(false);
      setActiveId(null);
    }
  }, [processingDropdownOpen, activeId, isMapVariant]);

  /** Keep the dock panel + embed host mounted whenever the processing stack is open (e.g. Geo AI “open timeline”). */
  useEffect(() => {
    if (!isMapVariant || !processingDropdownOpen || !processingEmbedSection) return;
    const sid = processingEmbedSection as SatelliteContextPanelId;
    if (!RAIL_MAP_TOOLBOX_IDS.has(sid)) return;
    if (!panelOpen || activeId !== sid) {
      lastActiveRef.current = sid;
      setActiveId(sid);
      setPanelOpen(true);
      setInnerTab('main');
    }
    if (mapStripHidden) {
      setMapStripHidden(false);
      const snap = mapRailLabeledBeforeStripHideRef.current;
      if (snap !== null) setMapRailLabeled(snap);
    }
  }, [
    isMapVariant,
    processingDropdownOpen,
    processingEmbedSection,
    panelOpen,
    activeId,
    mapStripHidden,
  ]);

  const openPanel = useCallback(
    (id: SatelliteContextPanelId) => {
      lastActiveRef.current = id;
      setActiveId(id);
      setPanelOpen(true);
      setInnerTab('main');
    },
    [],
  );

  const toggleRail = useCallback(
    (id: SatelliteContextPanelId) => {
      if (isMapVariant && id === 'table-geo-ai') {
        onGeoAiFloatingRailToggle?.();
        return;
      }
      if (isMapVariant && MAP_RAIL_FLOAT_IDS.has(id) && onProcessingWorkflowNavigate) {
        if (panelOpen && activeId === id) {
          setPanelOpen(false);
          setActiveId(null);
          onToolboxPanelClose?.();
          return;
        }
        openPanel(id);
        onProcessingWorkflowNavigate(id as SmartProcessingSectionId, undefined);
        return;
      }
      /* Docked-only tools (e.g. Layers): never stack under portaled Processing Options */
      if (panelOpen && activeId === id) {
        setPanelOpen(false);
        if (isMapVariant && processingDropdownOpen) {
          onToolboxPanelClose?.();
        }
        return;
      }
      if (isMapVariant && processingDropdownOpen) {
        onToolboxPanelClose?.();
      }
      openPanel(id);
    },
    [
      activeId,
      isMapVariant,
      onProcessingWorkflowNavigate,
      onToolboxPanelClose,
      onGeoAiFloatingRailToggle,
      openPanel,
      panelOpen,
      processingDropdownOpen,
    ],
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    if (isMapVariant) {
      onMapToolboxEmbedHost?.(null);
      onToolboxPanelClose?.();
    }
  }, [isMapVariant, onMapToolboxEmbedHost, onToolboxPanelClose]);

  const mapToolboxEmbedHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      onMapToolboxEmbedHost?.(node);
    },
    [onMapToolboxEmbedHost],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startW: panelWidth };
      const onMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return;
        let dx = ev.clientX - resizeRef.current.startX;
        if (variant === 'map' && direction === 'rtl') dx = -dx;
        const next = Math.min(560, Math.max(260, resizeRef.current.startW - dx));
        setPanelWidth(next);
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [panelWidth, variant, direction],
  );

  const activeMeta = activeId ? RAIL.find(r => r.id === activeId) : null;
  /** Section title for map toolbox dock chrome only (portaled panel hides its own header to avoid duplicates). */
  const processingEmbedTitle = useMemo(() => {
    if (!processingEmbedSection) return null;
    if (processingEmbedSection === 'source') return 'Source catalog';
    const row = RAIL_BY_ID[processingEmbedSection as SatelliteContextPanelId];
    if (row) return row.label;
    return 'Processing';
  }, [processingEmbedSection]);
  const aoiBarRows = useMemo(() => fieldComparisonBars ?? [], [fieldComparisonBars]);
  const maxBar = aoiBarRows.length ? Math.max(...aoiBarRows.map(p => Math.abs(p.value)), 1e-9) : 1;

  const isMap = isMapVariant;
  const mapPanelCollapsed = isMap && mapStripHidden;
  const panelLayoutOpen = panelOpen && !mapPanelCollapsed;
  const railWide = isMap ? !mapStripHidden && mapRailLabeled : railLabeled;

  const rootClass = [
    'si-sat-ctx-dock',
    isMap ? 'si-sat-ctx-dock--map si-sat-ctx-dock--map-tall si-sat-ctx-dock--map-toolbox' : 'si-sat-ctx-dock--embedded',
    mapPanelCollapsed ? 'si-sat-ctx-dock--map-strip-minimized' : '',
    panelLayoutOpen ? 'si-sat-ctx-dock--open' : 'si-sat-ctx-dock--closed',
    dockMode === 'float' ? 'si-sat-ctx-dock--float-mode' : '',
    surface === 'light' ? 'si-sat-ctx-dock--light' : 'si-sat-ctx-dock--dark',
    railWide ? 'si-sat-ctx-dock--rail-labeled' : 'si-sat-ctx-dock--rail-narrow',
    className.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  const railHintTitle = (item: (typeof RAIL)[number]) =>
    railWide ? item.title : item.hint ? `${item.title} — ${item.hint}` : item.title;

  return (
    <div className={rootClass} role="presentation" dir={direction}>
      <nav
        className={'si-sat-ctx-rail' + (railWide ? ' si-sat-ctx-rail--labeled' : '')}
        aria-label={isMap ? 'Map toolbox' : 'Analysis contextual tools'}
        data-toolbox-density={isMap ? (railWide ? 'labels' : 'icons') : undefined}
      >
        <div className="si-sat-ctx-rail__scroll">
        {isMap ? (
          <div
            className={
              'si-sat-ctx-rail-brand' +
              (railWide && !mapStripHidden ? ' si-sat-ctx-rail-brand--open' : '') +
              (mapStripHidden ? ' si-sat-ctx-rail-brand--minimized' : '')
            }
          >
            <span className="si-sat-ctx-rail-brand__mark" aria-hidden>
              <i className="fa-solid fa-toolbox" />
            </span>
            {railWide && !mapStripHidden ? (
              <span className="si-sat-ctx-rail-brand__title">Map toolbox</span>
            ) : null}
          </div>
        ) : null}
        {isMap && onMapToolboxAddData ? (
          <button
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-add-data' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
              (!railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '')
            }
            title="Add data — upload, import, or connect a new layer to the map"
            aria-label="Add data"
            onClick={() => onMapToolboxAddData()}
          >
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
              <span className="si-sat-ctx-rail-label-title">Add data</span>
              <span className="si-sat-ctx-rail-label-desc">Upload or connect a new map layer</span>
            </span>
          </button>
        ) : null}
        {railMenuGroups.map((group, gi) => (
          <Fragment key={group.join('-')}>
            {group.map(id => {
              const item = RAIL_BY_ID[id];
              if (!item) return null;
              const railPressed =
                (isMap &&
                  processingDropdownOpen &&
                  processingEmbedSection !== null &&
                  processingEmbedSection === item.id) ||
                (item.id === 'table-geo-ai' && geoAiFloatingOpen) ||
                (activeId === item.id &&
                  (MAP_RAIL_FLOAT_IDS.has(item.id) ? !panelOpen : panelOpen));
              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    'si-sat-ctx-rail-btn' +
                    (isMap ? ' si-sat-ctx-rail-btn--map' : '') +
                    (isMap && railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
                    (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '') +
                    (!isMap && railWide ? ' si-sat-ctx-rail-btn--row' : '') +
                    (railPressed ? ' si-sat-ctx-rail-btn--active' : '')
                  }
                  title={railHintTitle(item)}
                  aria-label={railWide ? item.label : railHintTitle(item)}
                  aria-pressed={railPressed}
                  onClick={() => toggleRail(item.id)}
                >
                  <SatelliteDockRailGlyph id={item.id} icon={item.icon} />
                  {isMap ? (
                    <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                      <span className="si-sat-ctx-rail-label-title">{item.label}</span>
                      {item.hint ? <span className="si-sat-ctx-rail-label-desc">{item.hint}</span> : null}
                    </span>
                  ) : railWide ? (
                    <span className="si-sat-ctx-rail-label">
                      <span className="si-sat-ctx-rail-label-title">{item.label}</span>
                      {item.hint ? <span className="si-sat-ctx-rail-label-desc">{item.hint}</span> : null}
                    </span>
                  ) : null}
                  {/* Fields rail badge — same convention as the GIS Map's
                   * `gis-sidebar-rail-btn__badge`: shows the saved-fields
                   * count on the icon so the user knows "you already have
                   * N fields" without opening the panel. Only renders for
                   * the `fields` rail item and only when there's at least
                   * one saved field. */}
                  {item.id === 'fields' && fieldsCount > 0 ? (
                    <span
                      className="si-sat-ctx-rail-btn__badge"
                      aria-label={`${fieldsCount} saved field${fieldsCount === 1 ? '' : 's'}`}
                    >
                      {fieldsCount > 99 ? '99+' : fieldsCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {gi < railMenuGroups.length - 1 ? (
              <div className="si-sat-ctx-rail-sep" role="separator" aria-hidden />
            ) : null}
          </Fragment>
        ))}
        {isMap && mapSymbologyToolbarSlot ? (
          <div className="si-sat-ctx-rail-sym-wrap" role="group" aria-label="Symbology">
            {mapSymbologyToolbarSlot}
          </div>
        ) : null}
        {isMap && mapSpectralLegendAvailable && onToggleMapSpectralLegend ? (
          <button
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--legend-tool' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
              (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '') +
              (mapSpectralLegendOpen ? ' si-sat-ctx-rail-btn--active' : '')
            }
            title={
              language === 'ar'
                ? mapSpectralLegendOpen
                  ? 'إخفاء وسيلة الإيضاح على الخريطة'
                  : 'إظهار وسيلة الإيضاح (طبقات WMS / RGB)'
                : mapSpectralLegendOpen
                  ? 'Hide legend overlay on map'
                  : 'Show legend — WMS / RGB layer symbology on map'
            }
            aria-label={language === 'ar' ? 'تبديل وسيلة الإيضاح على الخريطة' : 'Toggle map legend overlay'}
            aria-pressed={mapSpectralLegendOpen}
            onClick={() => onToggleMapSpectralLegend()}
          >
            <span className="si-sat-ctx-rail-legend-glyph" aria-hidden>
              <i className="fa-solid fa-book-atlas" />
            </span>
            {isMap ? (
              <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                <span className="si-sat-ctx-rail-label-title">{language === 'ar' ? 'إيضاح' : 'Legend'}</span>
                <span className="si-sat-ctx-rail-label-desc">
                  {language === 'ar' ? 'عرض مفتاح الطبقة على الخريطة' : 'Layer key on map'}
                </span>
              </span>
            ) : null}
          </button>
        ) : null}
        {isMap && onToggleRouteMap ? (
          <button
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--route-tool' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
              (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '') +
              (routeMapOpen ? ' si-sat-ctx-rail-btn--active' : '')
            }
            title={
              language === 'ar'
                ? routeMapOpen
                  ? 'إغلاق خريطة المسار'
                  : 'خريطة المسار — توجيه الشوارع GraphHopper'
                : routeMapOpen
                  ? 'Close Route Map'
                  : 'Route Map — GraphHopper street routing & alternatives'
            }
            aria-label={language === 'ar' ? 'خريطة المسار' : 'Route Map tool'}
            aria-pressed={routeMapOpen}
            onClick={() => onToggleRouteMap()}
          >
            <span className="si-sat-ctx-rail-route-glyph" aria-hidden>
              <i className="fa-solid fa-map-signs" />
            </span>
            {isMap ? (
              <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                <span className="si-sat-ctx-rail-label-title">{language === 'ar' ? 'مسار' : 'Route'}</span>
                <span className="si-sat-ctx-rail-label-desc">
                  {language === 'ar' ? 'توجيه الشوارع' : 'Street routing'}
                </span>
              </span>
            ) : null}
          </button>
        ) : null}
        {isMap && onToggleMapWeatherIntel ? (
          <button
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--wx-intel-tool' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
              (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '') +
              (mapWeatherIntelActive ? ' si-sat-ctx-rail-btn--active' : '')
            }
            title={
              language === 'ar'
                ? mapWeatherIntelActive
                  ? 'إيقاف طقس الموقع (Open-Meteo)'
                  : 'طقس الموقع — نقرة خريطة أو بحث أو طبقة'
                : mapWeatherIntelActive
                  ? 'Turn off weather intelligence'
                  : 'Weather intelligence — Open-Meteo at click, search, or feature'
            }
            aria-label={language === 'ar' ? 'طقس الموقع' : 'Weather intelligence'}
            aria-pressed={mapWeatherIntelActive}
            onClick={() => onToggleMapWeatherIntel()}
          >
            <span className="si-sat-ctx-rail-wx-intel-glyph" aria-hidden>
              <i className="fa-solid fa-temperature-half" />
            </span>
            {isMap ? (
              <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                <span className="si-sat-ctx-rail-label-title">{language === 'ar' ? 'طقس' : 'Weather'}</span>
                <span className="si-sat-ctx-rail-label-desc">
                  {language === 'ar' ? 'Open-Meteo' : 'Open-Meteo intel'}
                </span>
              </span>
            ) : null}
          </button>
        ) : null}
        {isMap && onOpenMapPrint ? (
          <button
            type="button"
            className={
              'si-sat-ctx-rail-btn si-sat-ctx-rail-btn--map si-sat-ctx-rail-btn--print-tool' +
              (railWide ? ' si-sat-ctx-rail-btn--row si-sat-ctx-rail-btn--map-expanded' : '') +
              (isMap && !railWide ? ' si-sat-ctx-rail-btn--map-collapsed' : '')
            }
            title={
              language === 'ar'
                ? 'طباعة الخريطة — معاينة وتصدير PDF'
                : 'Print map — preview & PDF export'
            }
            aria-label={language === 'ar' ? 'طباعة الخريطة' : 'Print map'}
            onClick={() => onOpenMapPrint()}
          >
            <span className="si-sat-ctx-rail-print-glyph" aria-hidden>
              <i className="fa-solid fa-print" />
            </span>
            {isMap ? (
              <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                <span className="si-sat-ctx-rail-label-title">{language === 'ar' ? 'طباعة' : 'Print'}</span>
                <span className="si-sat-ctx-rail-label-desc">
                  {language === 'ar' ? 'معاينة الخريطة وتصدير PDF' : 'Map preview & PDF'}
                </span>
              </span>
            ) : null}
          </button>
        ) : null}
        </div>
        <div
          className={
            'si-sat-ctx-rail__footer si-sat-ctx-rail-footer' + (isMap ? ' si-sat-ctx-rail-footer--map' : '')
          }
        >
          {isMap && mapStripHidden ? (
            <button
              type="button"
              className="si-sat-ctx-rail-strip-show"
              title="Restore full toolbox strip (keeps your label mode and panel state)"
              aria-label="Restore full map toolbox strip"
              onClick={() => {
                setMapStripHidden(false);
                const snap = mapRailLabeledBeforeStripHideRef.current;
                if (snap !== null) setMapRailLabeled(snap);
              }}
            >
              <i className="fa-solid fa-angles-left" aria-hidden />
              <span className="si-sat-ctx-rail-strip-show__label">Full strip</span>
            </button>
          ) : null}
          {isMap && !mapStripHidden ? (
            <button
              type="button"
              className="si-sat-ctx-rail-strip-hide"
              title="Minimize strip to edge — icons stay visible; panel stays ready when you expand again"
              aria-label="Minimize map toolbox strip to edge"
              aria-pressed={mapStripHidden}
              onClick={() => {
                mapRailLabeledBeforeStripHideRef.current = mapRailLabeled;
                setMapStripHidden(true);
              }}
            >
              <i className="fa-solid fa-angles-right" aria-hidden />
            </button>
          ) : null}
          {!isMap || !mapStripHidden ? (
            <button
              type="button"
              className={
                'si-sat-ctx-rail-collapse' +
                (railWide ? ' si-sat-ctx-rail-collapse--labeled' : '') +
                (isMap ? ' si-sat-ctx-rail-collapse--map' : '')
              }
              title={
                railWide
                  ? isMap
                    ? 'Expand: switch to icon-only rail for maximum map space'
                    : 'Collapse sidebar, close context panel, and show icons only'
                  : isMap
                    ? 'Collapse: show icons with text labels on the toolbox'
                    : 'Expand sidebar (show labels)'
              }
              aria-label={
                railWide
                  ? isMap
                    ? 'Expand toolbox to icon-only mode'
                    : 'Collapse sidebar and close panel'
                  : isMap
                    ? 'Collapse toolbox to show text labels'
                    : 'Expand toolbox labels'
              }
              {...(isMap
                ? { role: 'switch' as const, 'aria-checked': !railWide }
                : { 'aria-pressed': railWide as boolean })}
              onClick={() => {
                if (railWide) {
                  if (panelOpen) closePanel();
                  if (isMap) setMapRailLabeled(false);
                  else setRailLabeled(false);
                } else if (isMap) setMapRailLabeled(true);
                else setRailLabeled(true);
              }}
            >
              <span className="si-sat-ctx-rail-collapse__icon-wrap" aria-hidden>
                <i className={railWide ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'} />
              </span>
            </button>
          ) : null}
        </div>
      </nav>

      <div
        className="si-sat-ctx-panel-wrap"
        style={
          panelLayoutOpen
            ? { width: panelWidth, flexBasis: panelWidth, minWidth: 0 }
            : { width: 0, flexBasis: 0, minWidth: 0, maxWidth: 0 }
        }
        aria-hidden={!panelLayoutOpen}
      >
        <aside
          className={
            'si-sat-ctx-panel' +
            (isMap && panelOpen && processingDropdownOpen ? ' si-sat-ctx-panel--processing-embed-mode' : '')
          }
          role="complementary"
          aria-label={
            isMap && processingDropdownOpen && processingEmbedTitle
              ? `${processingEmbedTitle} panel`
              : activeMeta
                ? `${activeMeta.title} panel`
                : 'Context panel'
          }
        >
          {panelOpen && activeId ? (
            <>
              <div className="si-sat-ctx-panel-resize" onPointerDown={onResizePointerDown} title="Resize panel" />
              <header className="si-sat-ctx-panel-header">
                <div className="si-sat-ctx-panel-header-text">
                  {isMap && processingDropdownOpen && processingEmbedTitle ? (
                    <h2 className="si-sat-ctx-panel-title si-sat-ctx-panel-title--toolbox-embed-root">
                      {processingEmbedTitle}
                    </h2>
                  ) : (
                    <>
                      <span className="si-sat-ctx-panel-kicker">
                        {!isMap ? 'Analysis tools' : 'Context'}
                      </span>
                      <h2 className="si-sat-ctx-panel-title">{activeMeta?.title ?? 'Panel'}</h2>
                    </>
                  )}
                </div>
                <div className="si-sat-ctx-panel-header-actions">
                  <button
                    type="button"
                    className="si-sat-ctx-icon-btn"
                    title={surface === 'dark' ? 'Light surface' : 'Dark surface'}
                    aria-label="Toggle panel theme"
                    onClick={() => setSurface(s => (s === 'dark' ? 'light' : 'dark'))}
                  >
                    <i className={`fa-solid ${surface === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="si-sat-ctx-icon-btn"
                    title={dockMode === 'dock' ? 'Floating style' : 'Docked style'}
                    aria-label="Toggle dock or float appearance"
                    onClick={() => setDockMode(m => (m === 'dock' ? 'float' : 'dock'))}
                  >
                    <i className={`fa-solid ${dockMode === 'dock' ? 'fa-window-restore' : 'fa-table-columns'}`} aria-hidden />
                  </button>
                  <button type="button" className="si-sat-ctx-icon-btn" title="Close" aria-label="Close panel" onClick={closePanel}>
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              </header>

              {isMap && processingDropdownOpen ? (
                <div
                  ref={mapToolboxEmbedHostRef}
                  className="si-sat-ctx-map-toolbox-host"
                  data-si-map-toolbox-portal=""
                />
              ) : (
                <>
                  <div className="si-sat-ctx-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={innerTab === 'main'}
                      className={'si-sat-ctx-tab' + (innerTab === 'main' ? ' si-sat-ctx-tab--on' : '')}
                      onClick={() => setInnerTab('main')}
                    >
                      Main
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={innerTab === 'options'}
                      className={'si-sat-ctx-tab' + (innerTab === 'options' ? ' si-sat-ctx-tab--on' : '')}
                      onClick={() => setInnerTab('options')}
                    >
                      {activeId === 'fields' ? 'Field Data' : 'Options'}
                    </button>
                  </div>

                  <div
                    className={
                      'si-sat-ctx-panel-body' +
                      (!isMap ? ' si-sat-ctx-panel-body--embedded-analysis' : '')
                    }
                  >
                    {!isMap ? (
                      <nav className="si-sat-ctx-analysis-launcher" aria-label="Contextual analysis tools">
                        {RAIL.map(item => {
                          /* Embedded dock: no portaled float stack — active follows panel + selection */
                          const launcherPressed = activeId === item.id && panelOpen;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={
                                'si-sat-ctx-analysis-launcher-btn' +
                                (launcherPressed ? ' si-sat-ctx-analysis-launcher-btn--active' : '')
                              }
                              title={railHintTitle(item)}
                              aria-label={railWide ? item.label : railHintTitle(item)}
                              aria-pressed={launcherPressed}
                              onClick={() => toggleRail(item.id)}
                            >
                              <SatelliteDockRailGlyph id={item.id} icon={item.icon} />
                              <span className="si-sat-ctx-analysis-launcher-label">{item.label}</span>
                            </button>
                          );
                        })}
                      </nav>
                    ) : null}
                    <div className="si-sat-ctx-panel-body-core">
                {innerTab === 'main' ? (
                  <>
                    {activeId === 'layers' && mapToolboxLayersMain}
                    {/* Fields Data drawer — pure pass-through. The panel
                     * itself (search, list, "+ Draw new field", per-field
                     * cards, export) lives in `<FieldsPanel/>` rendered
                     * by the parent (Satellite Intelligence) and handed
                     * in via `fieldsPanelContent`. Wrapped in a thin
                     * `si-sat-ctx-fields-host` so the existing dock body
                     * scroll + theme rules wrap the panel cleanly without
                     * the FieldsPanel needing its own outer chrome. */}
                    {activeId === 'fields' && (
                      <div className="si-sat-ctx-fields-host">
                        {fieldsPanelWorkspaceContent ??
                          fieldsPanelContent ?? (
                          <div className="si-sat-ctx-prose">
                            <p>
                              <strong>Fields Data</strong> is unavailable in this context.
                            </p>
                            <p className="si-sat-ctx-muted">
                              Open the Satellite Intelligence map to draw and save fields.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {activeId === 'spatial' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Spatial analysis</strong> runs on the committed AOI and selected imagery window (timeline).
                        </p>
                        <p className="si-sat-ctx-muted">Raster zonal summaries and STAC workflows stay aligned with the current map extent.</p>
                      </div>
                    )}
                    {activeId === 'aoi' && (
                      <SiAoiObjectsPanel
                        variant="dock"
                        mapTool={mapTool as MapDrawTool}
                        onMapTool={onMapTool}
                        hasClearableDrawing={!!hasClearableDrawing}
                        onClearDrawing={() => onClearDrawing?.()}
                        hasAoi={hasAoi}
                        drawAssistHint={drawAssistHint}
                        multiAoiItems={multiAoiItems ?? []}
                        activeMultiAoiId={activeMultiAoiId ?? null}
                        onSelectAoi={id => onSelectAoi?.(id)}
                        onRenameAoi={(id, name) => onRenameAoi?.(id, name)}
                        onRemoveAoi={id => onRemoveAoi?.(id)}
                        drawnStats={aoiDrawnStats ?? null}
                        fieldTimelineSessionActive={fieldTimelineSessionActive}
                        hasEditableGeometry={hasEditableAoiGeometry}
                        aoiEditEnabled={aoiEditEnabled}
                        onToggleAoiEdit={onToggleAoiEdit}
                        aoiEditSubTool={aoiEditSubTool}
                        onAoiEditSubTool={onAoiEditSubTool}
                        aoiEditShowAllVertices={aoiEditShowAllVertices}
                        onToggleAoiEditAllVertices={onToggleAoiEditAllVertices}
                      />
                    )}
                    {activeId === 'charts' &&
                      (chartsCompact ? (
                        <div className="si-sat-ctx-prose">
                          <p>
                            <strong>Charts</strong> open on the map for full multi-layer timelines and exports.
                          </p>
                          <button
                            type="button"
                            className="si-sat-ctx-primary-btn"
                            disabled={!aoiTimelineChartsAvailable}
                            title={
                              aoiTimelineChartsAvailable
                                ? undefined
                                : 'Generate timeline in Remote Sensing first'
                            }
                            onClick={() => onToggleStaticCharts()}
                          >
                            {staticChartsOpen
                              ? 'Hide AOI timeline chart'
                              : 'Show AOI timeline chart'}
                          </button>
                        </div>
                      ) : (
                        <div className="si-sat-ctx-charts-block">
                          <p className="si-sat-ctx-muted">
                            {indexLabel} · AOI-scoped timeline. Toggle comparison indices below.
                          </p>
                          <StaticAoiComparisonLayerToolbar
                            staticComparisonLayers={staticComparisonLayers}
                            onStaticComparisonLayerToggle={id => onStaticComparisonLayerToggle?.(id)}
                          />
                          <AoiStaticMultiLayerLineChart
                            title="Raster mean in AOI by week"
                            labels={staticMultiLineLabels}
                            datasets={staticMultiLineDatasets}
                            hasLst={staticMultiLineHasLst}
                            exportLngLatPerRow={staticChartExportLngLatPerRow}
                            onRequestGenerateReport={onRequestGenerateReport}
                            geoAiIndexAnalyticalExportContext={geoAiIndexAnalyticalExportContext}
                            scatterAoiFeature={scatterAoiFeature}
                            scatterAoiKey={scatterAoiKey}
                            scatterWeekly={scatterWeekly}
                            scatterWeekIndex={scatterWeekIndex}
                            scatterRasterSample={scatterRasterSample}
                          />
                        </div>
                      ))}
                    {activeId === 'stats' && (
                      <div className="si-sat-ctx-stats">
                        <div className="si-map-analysis-chart-card">
                          <div className="si-map-analysis-chart-kicker">Time series (spark)</div>
                          <svg className="si-map-analysis-spark" viewBox="0 0 120 40" preserveAspectRatio="none">
                            <path
                              className="si-map-analysis-spark-path"
                              d={sparkPathBuilder(weeklyMeans.length ? weeklyMeans : [0], 120, 40)}
                              fill="none"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                        </div>
                        {spectralProfile ? (
                          <div className="si-map-analysis-chart-card si-map-analysis-chart-card--spectral">
                            <AoiSpectralProfileMiniChart profile={spectralProfile} />
                          </div>
                        ) : null}
                        <div className="si-map-analysis-chart-card">
                          <div className="si-map-analysis-chart-kicker">AOI layers (bar)</div>
                          {fieldComparisonSubtitle ? (
                            <p className="si-sat-ctx-muted" style={{ margin: '0 0 6px', fontSize: 10 }}>
                              {fieldComparisonSubtitle}
                            </p>
                          ) : null}
                          {aoiBarRows.length === 0 ? (
                            <p className="si-sat-ctx-muted" style={{ margin: 0, fontSize: 10, lineHeight: 1.4 }}>
                              Draw a polygon AOI to list sketch and inner field means for the selected map week.
                            </p>
                          ) : (
                            <div className="si-map-analysis-bars">
                              {aoiBarRows.slice(0, 8).map(row => (
                                <div key={row.name} className="si-map-analysis-bar-row">
                                  <span className="si-map-analysis-bar-name">{row.name}</span>
                                  <div className="si-map-analysis-bar-track">
                                    <span
                                      className="si-map-analysis-bar-fill"
                                      style={{ width: `${Math.min(100, (Math.abs(row.value) / maxBar) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="si-map-analysis-bar-val">{formatStatFixed(row.value, 2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="si-map-analysis-chart-card si-map-analysis-chart-card--pie">
                          <div className="si-map-analysis-chart-kicker">AOI mix (pie)</div>
                          {aoiBarRows.length === 0 ? (
                            <p className="si-sat-ctx-muted" style={{ margin: '0 0 6px', fontSize: 10 }}>
                              Pie shares match the AOI bar list once rows exist.
                            </p>
                          ) : null}
                          <div className="si-map-analysis-pie-wrap">
                            {aoiBarRows.slice(0, 6).map((row, i, arr) => {
                              const sum = arr.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
                              const pct = (Math.abs(row.value) / sum) * 100;
                              const hue = 140 + i * 28;
                              return (
                                <div key={row.name} className="si-map-analysis-pie-seg">
                                  <span className="si-map-analysis-pie-dot" style={{ background: `hsl(${hue} 65% 46%)` }} />
                                  <span className="si-map-analysis-pie-lbl">{row.name}</span>
                                  <span className="si-map-analysis-pie-pct">{pct.toFixed(0)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    {activeId === 'weather' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Weather data</strong> is attached to Agent Chat context when API keys are configured (OpenWeather).
                        </p>
                        <p className="si-sat-ctx-muted">Use Agent Chat prompts for forecasts near the map pin or AOI centroid.</p>
                      </div>
                    )}
                    {activeId === 'raster' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Raster controls</strong> — imagery date, WMS layer, and timeline playback live in Remote Sensing
                          and the bottom timeline bar.
                        </p>
                      </div>
                    )}
                    {activeId === 'feature' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Feature information</strong> appears when you identify a vector feature or use Agent Chat table map
                          links.
                        </p>
                        <p className="si-sat-ctx-muted">Select a feature on the map or open the attribute table from Layers.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="si-sat-ctx-prose">
                    {activeId === 'fields' ? (
                      <div className="si-sat-ctx-fields-host">
                        {fieldsPanelLibraryContent ??
                          fieldsPanelContent ?? (
                          <div className="si-sat-ctx-prose">
                            <p className="si-sat-ctx-muted">Field library is not configured.</p>
                          </div>
                        )}
                      </div>
                    ) : activeId === 'layers' && isMap && onProcessingWorkflowNavigate ? (
                      <div className="si-sat-ctx-layers-options-stack">
                        <div className="si-sat-ctx-subnav" role="navigation" aria-label="Layers options navigation">
                          <button
                            type="button"
                            className="si-sat-ctx-subnav-back"
                            onClick={() => setInnerTab('main')}
                            aria-label="Back to Layers main"
                          >
                            <i className="fa-solid fa-arrow-left" aria-hidden />
                            <span>Main</span>
                          </button>
                          <span className="si-sat-ctx-subnav-crumb">Layers · Options</span>
                        </div>
                        <p>
                          <strong>Options</strong> — open the floating processing stack for a section (state is preserved; no
                          page reload).
                        </p>
                        <div className="si-sat-ctx-toolbox-opt-actions" role="group" aria-label="Open processing sections">
                          {(
                            ['explore-stac', 'remote-sensing', 'ai-detection-gis', 'table-geo-ai'] as SmartProcessingSectionId[]
                          ).map(sid => (
                            <button
                              key={sid}
                              type="button"
                              className="si-sat-ctx-toolbox-opt-btn"
                              onClick={() => {
                                if (isMap && sid === 'table-geo-ai' && onGeoAiFloatingRailToggle) {
                                  onGeoAiFloatingRailToggle();
                                  return;
                                }
                                openPanel(sid as SatelliteContextPanelId);
                                onProcessingWorkflowNavigate(sid, { fromDockOptions: true });
                              }}
                            >
                              <i className={RAIL_BY_ID[sid].icon} aria-hidden />
                              <span>Open {RAIL_BY_ID[sid].label}</span>
                            </button>
                          ))}
                        </div>
                        {mapToolboxLayersOptionsExtra}
                      </div>
                    ) : (
                      <p className="si-sat-ctx-muted">
                        Tool-specific advanced options will appear here as features are extended.
                      </p>
                    )}
                  </div>
                )}
                    </div>
              </div>
                </>
              )}

            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
