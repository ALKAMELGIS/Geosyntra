import './satelliteMapAnalysisChrome.css';
import { AoiStaticMultiLayerLineChart, type AoiStaticMultiLayerLineChartDataset } from './AoiStaticMultiLayerLineChart';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';

export type TimelineChip = {
  id: string;
  shortLabel: string;
  fullDate: string;
  mean: number;
};

export type SatelliteMapAnalysisToolbarProps = {
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  /** AOI sketch committed or any drawing/edit session active — disables Clear when false */
  hasClearableDrawing?: boolean;
  /** Clear all AOI graphics, exit drawing mode, restore pan; leaves basemap / imagery layers intact */
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  analysisLayerAttached: boolean;
  onToggleAnalysisLayerAttached: () => void;
  /** When true, toolbar sits inside Remote Sensing card (no floating map position). */
  embedded?: boolean;
  className?: string;
};

export function SatelliteMapAnalysisToolbar({
  mapTool,
  onMapTool,
  hasClearableDrawing = false,
  onClearDrawing,
  hasAoi,
  staticChartsOpen,
  onToggleStaticCharts,
  analysisLayerAttached,
  onToggleAnalysisLayerAttached,
  embedded = false,
  className = '',
}: SatelliteMapAnalysisToolbarProps) {
  const rootClass = [
    'si-map-analysis-toolbar',
    embedded ? 'si-map-analysis-toolbar--embedded' : '',
    className.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass} role="toolbar" aria-label="Analysis tools">
      <button
        type="button"
        className={`si-map-analysis-tool ${mapTool === 'rectangle' ? 'si-map-analysis-tool--on' : ''}`}
        aria-pressed={mapTool === 'rectangle'}
        title="Draw rectangle AOI"
        onClick={() => onMapTool('rectangle')}
      >
        <i className="fa-regular fa-square" aria-hidden />
      </button>
      <button
        type="button"
        className={`si-map-analysis-tool ${mapTool === 'polygon' ? 'si-map-analysis-tool--on' : ''}`}
        aria-pressed={mapTool === 'polygon'}
        title="Polygon AOI: click corners, Shift for 15° edge steps, drag green dots, Enter or click first corner to close"
        onClick={() => onMapTool('polygon')}
      >
        <i className="fa-solid fa-draw-polygon" aria-hidden />
      </button>
      <button
        type="button"
        className={`si-map-analysis-tool ${mapTool === 'circle' ? 'si-map-analysis-tool--on' : ''}`}
        aria-pressed={mapTool === 'circle'}
        title="Circle AOI: drag from center to edge"
        onClick={() => onMapTool('circle')}
      >
        <i className="fa-regular fa-circle" aria-hidden />
      </button>
      <button
        type="button"
        className={`si-map-analysis-tool ${mapTool === 'select' ? 'si-map-analysis-tool--on' : ''}`}
        aria-pressed={mapTool === 'select'}
        title={hasAoi ? 'Select / edit AOI' : 'Select tool'}
        onClick={() => onMapTool('select')}
      >
        <i className="fa-solid fa-arrow-pointer" aria-hidden />
      </button>
      <button
        type="button"
        className="si-map-analysis-tool si-map-analysis-tool--clear"
        aria-label="Clear drawing"
        title="Clear all AOI drawings (polygon, rectangle, circle, sketches), exit drawing mode, and restore map pan. Optionally resets AOI-clipped overlay stacking."
        disabled={!hasClearableDrawing}
        onClick={() => onClearDrawing?.()}
      >
        <i className="fa-solid fa-eraser" aria-hidden />
      </button>
      <span className="si-map-analysis-toolbar-sep" aria-hidden />
      <button
        type="button"
        className={`si-map-analysis-tool ${staticChartsOpen ? 'si-map-analysis-tool--on' : ''}`}
        aria-pressed={staticChartsOpen}
        aria-label="Toggle AOI static charts"
        title="Static info charts (AOI-scoped)"
        onClick={onToggleStaticCharts}
      >
        <i className="fa-solid fa-chart-pie" aria-hidden />
      </button>
      <button
        type="button"
        className={`si-map-analysis-tool ${analysisLayerAttached ? 'si-map-analysis-tool--on' : ''}`}
        aria-pressed={analysisLayerAttached}
        title="Attach analysis output under imagery layer"
        onClick={onToggleAnalysisLayerAttached}
      >
        <i className="fa-solid fa-layer-group" aria-hidden />
      </button>
    </div>
  );
}

export type SatelliteMapAnalysisChromeProps = {
  weeklyChips: TimelineChip[];
  activeChipId: string | null;
  onPickChip: (id: string) => void;
  timelinePlaying: boolean;
  onTogglePlay: () => void;
  onStep: (dir: -1 | 1) => void;
  timelineVisible: boolean;
  mapTool: 'rectangle' | 'polygon' | 'circle' | 'select' | string;
  onMapTool: (tool: 'rectangle' | 'polygon' | 'circle' | 'select') => void;
  hasClearableDrawing?: boolean;
  onClearDrawing?: () => void;
  hasAoi: boolean;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  analysisLayerAttached: boolean;
  onToggleAnalysisLayerAttached: () => void;
  /** When true, duplicate toolbar stays on map (default off — toolbar lives in Remote Sensing panel). */
  showFloatingToolbar?: boolean;
  /** Sparkline means (0–1 normalized optional) */
  weeklyMeans: number[];
  pivotBars: Array<{ name: string; value: number }>;
  indexLabel: string;
  /** Multi-layer temporal line chart (WMS-style indices). */
  staticMultiLineLabels: string[];
  staticMultiLineDatasets: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst: boolean;
  staticComparisonLayers: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle: (id: StaticAoiChartLayerId) => void;
};

function sparkPath(values: number[], w: number, h: number): string {
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

export function SatelliteMapAnalysisChrome(props: SatelliteMapAnalysisChromeProps) {
  const {
    weeklyChips,
    activeChipId,
    onPickChip,
    timelinePlaying,
    onTogglePlay,
    onStep,
    timelineVisible,
    mapTool,
    onMapTool,
    hasClearableDrawing = false,
    onClearDrawing,
    hasAoi,
    staticChartsOpen,
    onToggleStaticCharts,
    analysisLayerAttached,
    onToggleAnalysisLayerAttached,
    showFloatingToolbar = false,
    weeklyMeans,
    pivotBars,
    indexLabel,
    staticMultiLineLabels,
    staticMultiLineDatasets,
    staticMultiLineHasLst,
    staticComparisonLayers,
    onStaticComparisonLayerToggle,
  } = props;

  const activeFull =
    weeklyChips.find(c => c.id === activeChipId)?.fullDate ??
    weeklyChips[0]?.fullDate ??
    '';

  const maxPivot = pivotBars.length ? Math.max(...pivotBars.map(p => Math.abs(p.value))) : 1;

  return (
    <>
      {timelineVisible && weeklyChips.length > 0 ? (
        <div className="si-map-analysis-timeline" role="region" aria-label="Imagery timeline">
          <div className="si-map-analysis-timeline-inner">
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
                className={`si-map-analysis-tl-play ${timelinePlaying ? 'si-map-analysis-tl-play--on' : ''}`}
                aria-label={timelinePlaying ? 'Pause timeline' : 'Play timeline'}
                aria-pressed={timelinePlaying}
                onClick={onTogglePlay}
              >
                <i className={timelinePlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} aria-hidden />
              </button>
              <button type="button" className="si-map-analysis-tl-btn" aria-label="Next period" onClick={() => onStep(1)}>
                <i className="fa-solid fa-forward-step" aria-hidden />
              </button>
            </div>
            <div className="si-map-analysis-timeline-track-wrap">
              <div className="si-map-analysis-timeline-chips" role="tablist">
                {weeklyChips.map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    role="tab"
                    aria-selected={chip.id === activeChipId}
                    className={`si-map-analysis-chip ${chip.id === activeChipId ? 'si-map-analysis-chip--active' : ''}`}
                    onClick={() => onPickChip(chip.id)}
                    title={`${chip.fullDate} · μ≈${chip.mean.toFixed(3)}`}
                  >
                    {chip.shortLabel}
                  </button>
                ))}
              </div>
              <div className="si-map-analysis-timeline-rail" aria-hidden />
            </div>
            <div className="si-map-analysis-timeline-date" title={activeFull}>
              {activeFull || '—'}
            </div>
          </div>
        </div>
      ) : null}

      {showFloatingToolbar ? (
        <SatelliteMapAnalysisToolbar
          embedded={false}
          mapTool={mapTool}
          onMapTool={onMapTool}
          hasClearableDrawing={hasClearableDrawing}
          onClearDrawing={onClearDrawing}
          hasAoi={hasAoi}
          staticChartsOpen={staticChartsOpen}
          onToggleStaticCharts={onToggleStaticCharts}
          analysisLayerAttached={analysisLayerAttached}
          onToggleAnalysisLayerAttached={onToggleAnalysisLayerAttached}
        />
      ) : null}

      {staticChartsOpen ? (
        <div className="si-map-analysis-charts" role="region" aria-label="Analysis charts">
          <div className="si-map-analysis-charts-head">
            <div className="si-map-analysis-charts-head-text">
              <span className="si-map-analysis-charts-title">AOI static charts</span>
              <span className="si-map-analysis-charts-subtitle">
                {indexLabel} · multi-layer timeline (sample). Legend click toggles lines; wheel zooms X.
              </span>
            </div>
            <button type="button" className="si-map-analysis-charts-close" aria-label="Close charts" onClick={onToggleStaticCharts}>
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
          <div className="si-map-analysis-charts-multiline">
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
                    onClick={() => onStaticComparisonLayerToggle(opt.id)}
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
          <div className="si-map-analysis-charts-grid si-map-analysis-charts-grid--below">
            <div className="si-map-analysis-chart-card">
              <div className="si-map-analysis-chart-kicker">Time series (spark)</div>
              <svg className="si-map-analysis-spark" viewBox="0 0 120 40" preserveAspectRatio="none">
                <path
                  className="si-map-analysis-spark-path"
                  d={sparkPath(weeklyMeans.length ? weeklyMeans : [0], 120, 40)}
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
        </div>
      ) : null}
    </>
  );
}
