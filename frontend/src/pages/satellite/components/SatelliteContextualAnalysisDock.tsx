import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/i18n';
import type { AoiStaticMultiLayerLineChartDataset } from './AoiStaticMultiLayerLineChart';
import { AoiStaticMultiLayerLineChart } from './AoiStaticMultiLayerLineChart';
import {
  SatelliteSmartProcessingPanel,
  type SatelliteProcessingEnvSection,
} from './SatelliteSmartProcessingPanel';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';

export type SatelliteContextPanelId =
  | 'layers'
  | 'spatial'
  | 'aoi'
  | 'charts'
  | 'stats'
  | 'weather'
  | 'raster'
  | 'feature'
  | 'processing';

export type SatelliteContextDockVariant = 'map' | 'embedded';

export type SatelliteContextualAnalysisDockProps = {
  variant: SatelliteContextDockVariant;
  /** When true, Charts tab shows a shortcut instead of the full chart (e.g. narrow embedded host). */
  chartsCompact?: boolean;
  className?: string;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  hasClearableDrawing?: boolean;
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  indexLabel?: string;
  staticMultiLineLabels?: string[];
  staticMultiLineDatasets?: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst?: boolean;
  staticComparisonLayers?: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle?: (id: StaticAoiChartLayerId) => void;
  weeklyMeans?: number[];
  pivotBars?: Array<{ name: string; value: number }>;
  sparkPathBuilder?: (values: number[], w: number, h: number) => string;
  /** Map toolbox: dock on map inline-start (left in LTR) instead of inline-end. */
  mapToolboxInlineStart?: boolean;
  /** Smart processing hub (GIS workflow) — optional callbacks from host page. */
  smartProcessing?: {
    layerContextHint?: string;
    layerKind?: 'raster' | 'vector' | 'none';
    onOpenEnvSection: (id: SatelliteProcessingEnvSection) => void;
    onGeoAiQuickPrompt?: (text: string) => void;
  };
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
    id: 'spatial',
    icon: 'fa-solid fa-vector-square',
    label: 'Analysis',
    title: 'Spatial analysis',
    hint: 'Zonal summaries and AOI-scoped workflows.',
  },
  {
    id: 'aoi',
    icon: 'fa-solid fa-draw-polygon',
    label: 'AOI sketch',
    title: 'AOI drawing tools',
    hint: 'Rectangle, polygon, circle, select, and clear.',
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
  {
    id: 'processing',
    icon: 'fa-solid fa-diagram-project',
    label: 'Processing',
    title: 'Smart processing',
    hint: 'GIS workflow: selection, SQL, spatial analysis, AI, quick actions.',
  },
];

const RAIL_GROUPS: SatelliteContextPanelId[][] = [
  ['layers', 'spatial', 'aoi'],
  ['charts', 'stats', 'weather'],
  ['raster', 'feature'],
];

/** In-map toolbox (`variant="map"`): layers, AOI sketch, smart processing hub. */
const RAIL_MAP_TOOLBOX_IDS = new Set<SatelliteContextPanelId>(['layers', 'aoi', 'processing']);
const RAIL_GROUPS_MAP: SatelliteContextPanelId[][] = [['layers', 'aoi'], ['processing']];

const RAIL_BY_ID = RAIL.reduce(
  (acc, r) => {
    acc[r.id] = r
    return acc
  },
  {} as Record<SatelliteContextPanelId, (typeof RAIL)[number]>,
)

function defaultSparkPath(values: number[], w: number, h: number): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(' L ')}`;
}

export function SatelliteContextualAnalysisDock(props: SatelliteContextualAnalysisDockProps) {
  const { direction } = useLanguage();
  const {
    variant,
    className = '',
    mapTool,
    onMapTool,
    hasClearableDrawing = false,
    onClearDrawing,
    hasAoi,
    staticChartsOpen,
    onToggleStaticCharts,
    chartsCompact = false,
    indexLabel = '',
    staticMultiLineLabels = [],
    staticMultiLineDatasets = [],
    staticMultiLineHasLst = false,
    staticComparisonLayers = [],
    onStaticComparisonLayerToggle,
    weeklyMeans = [],
    pivotBars = [],
    sparkPathBuilder = defaultSparkPath,
    mapToolboxInlineStart = false,
    smartProcessing,
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
      if (panelOpen && activeId === id) {
        setPanelOpen(false);
        return;
      }
      openPanel(id);
    },
    [activeId, openPanel, panelOpen],
  );

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startW: panelWidth };
      const onMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return;
        let dx = ev.clientX - resizeRef.current.startX;
        if (variant === 'map' && direction === 'rtl') dx = -dx;
        let nextW = resizeRef.current.startW - dx;
        if (variant === 'map' && mapToolboxInlineStart && direction === 'ltr') {
          nextW = resizeRef.current.startW + dx;
        }
        const next = Math.min(560, Math.max(260, nextW));
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
    [panelWidth, variant, direction, mapToolboxInlineStart],
  );

  const activeMeta = activeId ? RAIL.find(r => r.id === activeId) : null;
  const maxPivot = pivotBars.length ? Math.max(...pivotBars.map(p => Math.abs(p.value))) : 1;

  const isMap = isMapVariant;
  const mapPanelCollapsed = isMap && mapStripHidden;
  const panelLayoutOpen = panelOpen && !mapPanelCollapsed;
  const railWide = isMap ? !mapStripHidden && mapRailLabeled : railLabeled;

  const rootClass = [
    'si-sat-ctx-dock',
    isMap
      ? 'si-sat-ctx-dock--map si-sat-ctx-dock--map-tall si-sat-ctx-dock--map-toolbox' +
        (mapToolboxInlineStart ? ' si-sat-ctx-dock--map-left' : '')
      : 'si-sat-ctx-dock--embedded',
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
    railWide ? item.title : `${item.title} — ${item.hint}`;

  return (
    <div className={rootClass} role="presentation" dir={direction}>
      <nav
        className={'si-sat-ctx-rail' + (railWide ? ' si-sat-ctx-rail--labeled' : '')}
        aria-label={isMap ? 'Map toolbox' : 'Analysis contextual tools'}
        data-toolbox-density={isMap ? (railWide ? 'labeled' : 'compact') : undefined}
      >
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
        {railMenuGroups.map((group, gi) => (
          <Fragment key={group.join('-')}>
            {group.map(id => {
              const item = RAIL_BY_ID[id];
              if (!item) return null;
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
                    (panelOpen && activeId === item.id ? ' si-sat-ctx-rail-btn--active' : '')
                  }
                  title={railHintTitle(item)}
                  aria-label={railWide ? item.label : railHintTitle(item)}
                  aria-pressed={panelOpen && activeId === item.id}
                  onClick={() => toggleRail(item.id)}
                >
                  <i className={item.icon} aria-hidden />
                  {isMap ? (
                    <span className="si-sat-ctx-rail-label" aria-hidden={!railWide}>
                      <span className="si-sat-ctx-rail-label-title">{item.label}</span>
                      <span className="si-sat-ctx-rail-label-desc">{item.hint}</span>
                    </span>
                  ) : railWide ? (
                    <span className="si-sat-ctx-rail-label">
                      <span className="si-sat-ctx-rail-label-title">{item.label}</span>
                      <span className="si-sat-ctx-rail-label-desc">{item.hint}</span>
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
        <div className="si-sat-ctx-rail-spacer" aria-hidden />
        <div className={'si-sat-ctx-rail-footer' + (isMap ? ' si-sat-ctx-rail-footer--map' : '')}>
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
                    ? 'Compact rail — icons only for maximum map space'
                    : 'Collapse sidebar, close context panel, and show icons only'
                  : isMap
                    ? 'Show tool names and hints on the rail'
                    : 'Expand sidebar (show labels)'
              }
              aria-label={
                railWide
                  ? isMap
                    ? 'Compact toolbox rail (icons only)'
                    : 'Collapse sidebar and close panel'
                  : isMap
                    ? 'Show labeled toolbox rail'
                    : 'Expand toolbox labels'
              }
              {...(isMap
                ? { role: 'switch' as const, 'aria-checked': railWide }
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
              {railWide ? (
                <span className="si-sat-ctx-rail-collapse-text">{isMap ? 'Compact' : 'Collapse'}</span>
              ) : null}
            </button>
          ) : null}
        </div>
      </nav>

      <div
        className="si-sat-ctx-panel-wrap"
        style={panelLayoutOpen ? { width: panelWidth, flexBasis: panelWidth } : { width: 0, flexBasis: 0 }}
        aria-hidden={!panelLayoutOpen}
      >
        <aside
          className="si-sat-ctx-panel"
          role="complementary"
          aria-label={activeMeta ? `${activeMeta.title} panel` : 'Context panel'}
        >
          {panelOpen && activeId ? (
            <>
              <div className="si-sat-ctx-panel-resize" onPointerDown={onResizePointerDown} title="Resize panel" />
              <header className="si-sat-ctx-panel-header">
                <div className="si-sat-ctx-panel-header-text">
                  <span className="si-sat-ctx-panel-kicker">Context</span>
                  <h2 className="si-sat-ctx-panel-title">{activeMeta?.title ?? 'Panel'}</h2>
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
                  Options
                </button>
              </div>

              <div className="si-sat-ctx-panel-body">
                {innerTab === 'main' ? (
                  <>
                    {activeId === 'layers' && (
                      <div className="si-sat-ctx-prose">
                        <p>
                          <strong>Layer settings</strong> — opacity, ordering, and imagery visibility are managed from the
                          environment <strong>Layers</strong> tab. Use this panel for quick context while mapping.
                        </p>
                        <ul className="si-sat-ctx-list">
                          <li>Toggle index overlay visibility in Remote Sensing.</li>
                          <li>Added vector layers support identify and table actions.</li>
                        </ul>
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
                      <div className="si-sat-ctx-aoi-tools">
                        <p className="si-sat-ctx-muted">Draw or edit the analysis boundary.</p>
                        <div className="si-sat-ctx-aoi-grid" role="group" aria-label="AOI draw tools">
                          <button
                            type="button"
                            className={`si-sat-ctx-aoi-btn ${mapTool === 'rectangle' ? 'si-sat-ctx-aoi-btn--on' : ''}`}
                            aria-pressed={mapTool === 'rectangle'}
                            title="Rectangle AOI"
                            onClick={() => onMapTool('rectangle')}
                          >
                            <i className="fa-regular fa-square" aria-hidden />
                            <span>Rectangle</span>
                          </button>
                          <button
                            type="button"
                            className={`si-sat-ctx-aoi-btn ${mapTool === 'polygon' ? 'si-sat-ctx-aoi-btn--on' : ''}`}
                            aria-pressed={mapTool === 'polygon'}
                            title="Polygon AOI"
                            onClick={() => onMapTool('polygon')}
                          >
                            <i className="fa-solid fa-draw-polygon" aria-hidden />
                            <span>Polygon</span>
                          </button>
                          <button
                            type="button"
                            className={`si-sat-ctx-aoi-btn ${mapTool === 'circle' ? 'si-sat-ctx-aoi-btn--on' : ''}`}
                            aria-pressed={mapTool === 'circle'}
                            title="Circle AOI"
                            onClick={() => onMapTool('circle')}
                          >
                            <i className="fa-regular fa-circle" aria-hidden />
                            <span>Circle</span>
                          </button>
                          <button
                            type="button"
                            className={`si-sat-ctx-aoi-btn ${mapTool === 'select' ? 'si-sat-ctx-aoi-btn--on' : ''}`}
                            aria-pressed={mapTool === 'select'}
                            title={hasAoi ? 'Select / edit AOI' : 'Select'}
                            onClick={() => onMapTool('select')}
                          >
                            <i className="fa-solid fa-arrow-pointer" aria-hidden />
                            <span>Select</span>
                          </button>
                          <button
                            type="button"
                            className="si-sat-ctx-aoi-btn si-sat-ctx-aoi-btn--danger"
                            disabled={!hasClearableDrawing}
                            title="Clear drawing"
                            onClick={() => onClearDrawing?.()}
                          >
                            <i className="fa-solid fa-eraser" aria-hidden />
                            <span>Clear</span>
                          </button>
                        </div>
                      </div>
                    )}
                    {activeId === 'charts' &&
                      (chartsCompact ? (
                        <div className="si-sat-ctx-prose">
                          <p>
                            <strong>Charts</strong> open on the map for full multi-layer timelines and exports.
                          </p>
                          <button type="button" className="si-sat-ctx-primary-btn" onClick={() => onToggleStaticCharts()}>
                            {staticChartsOpen ? 'Hide map charts' : 'Show map charts'}
                          </button>
                        </div>
                      ) : (
                        <div className="si-sat-ctx-charts-block">
                          <p className="si-sat-ctx-muted">
                            {indexLabel} · AOI-scoped timeline. Toggle comparison indices below.
                          </p>
                          <div className="si-map-analysis-layer-toolbar" role="group" aria-label="WMS comparison layers">
                            {STATIC_AOI_CHART_LAYER_OPTIONS.map(opt => {
                              const on = staticComparisonLayers.includes(opt.id);
                              const onlyOne = staticComparisonLayers.length <= 1;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  className={`si-map-analysis-layer-chip ${on ? 'si-map-analysis-layer-chip--on' : ''}`}
                                  title={opt.subtitle}
                                  aria-pressed={on}
                                  disabled={on && onlyOne}
                                  onClick={() => onStaticComparisonLayerToggle?.(opt.id)}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <AoiStaticMultiLayerLineChart
                            title="Raster mean in AOI by week"
                            labels={staticMultiLineLabels}
                            datasets={staticMultiLineDatasets}
                            hasLst={staticMultiLineHasLst}
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
                        <div className="si-map-analysis-chart-card">
                          <div className="si-map-analysis-chart-kicker">Fields (bar)</div>
                          <div className="si-map-analysis-bars">
                            {pivotBars.slice(0, 8).map(row => (
                              <div key={row.name} className="si-map-analysis-bar-row">
                                <span className="si-map-analysis-bar-name">{row.name}</span>
                                <div className="si-map-analysis-bar-track">
                                  <span
                                    className="si-map-analysis-bar-fill"
                                    style={{ width: `${Math.min(100, (Math.abs(row.value) / maxPivot) * 100)}%` }}
                                  />
                                </div>
                                <span className="si-map-analysis-bar-val">{row.value.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="si-map-analysis-chart-card si-map-analysis-chart-card--pie">
                          <div className="si-map-analysis-chart-kicker">Mix (pie)</div>
                          <div className="si-map-analysis-pie-wrap">
                            {pivotBars.slice(0, 6).map((row, i, arr) => {
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
                          <strong>Weather data</strong> is attached to Geo AI context when API keys are configured (OpenWeather).
                        </p>
                        <p className="si-sat-ctx-muted">Use Geo AI prompts for forecasts near the map pin or AOI centroid.</p>
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
                          <strong>Feature information</strong> appears when you identify a vector feature or use Geo AI table map
                          links.
                        </p>
                        <p className="si-sat-ctx-muted">Select a feature on the map or open the attribute table from Layers.</p>
                      </div>
                    )}
                    {activeId === 'processing' &&
                      (smartProcessing ? (
                        <SatelliteSmartProcessingPanel
                          layerContextHint={smartProcessing.layerContextHint}
                          layerKind={smartProcessing.layerKind}
                          onOpenEnvSection={smartProcessing.onOpenEnvSection}
                          onGeoAiQuickPrompt={smartProcessing.onGeoAiQuickPrompt}
                        />
                      ) : (
                        <div className="si-sat-ctx-prose">
                          <p className="si-sat-ctx-muted">Smart processing is not wired for this host.</p>
                        </div>
                      ))}
                  </>
                ) : (
                  <div className="si-sat-ctx-prose">
                    <p className="si-sat-ctx-muted">Tool-specific advanced options will appear here as features are extended.</p>
                  </div>
                )}
              </div>

              <footer className="si-sat-ctx-panel-footer">
                <span className="si-sat-ctx-footer-hint">
                  {activeId === 'aoi'
                    ? 'Polygon: Shift constrains angles · Circle: Enter commits · Clear restores pan.'
                    : 'Drag the inner edge to resize. Click the active tool again to collapse.'}
                </span>
              </footer>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
