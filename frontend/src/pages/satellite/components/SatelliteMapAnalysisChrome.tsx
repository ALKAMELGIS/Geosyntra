import './satelliteMapAnalysisChrome.css';
import type { ReactNode, RefObject } from 'react';
import type { AoiStaticMultiLayerLineChartDataset } from './AoiStaticMultiLayerLineChart';
import {
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';
import { SatelliteContextualAnalysisDock } from './SatelliteContextualAnalysisDock';
import type { SmartProcessingSectionId } from './SmartProcessingWorkflowPanel';
import { MapToolsDock } from './MapToolsDock';

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
  /** When true, toolbar sits inside Remote Sensing card (no floating map position). */
  embedded?: boolean;
  /** When true, Charts tab is a compact shortcut (optional). */
  chartsCompact?: boolean;
  className?: string;
  /** Optional — enriches embedded contextual Stats tab */
  weeklyMeans?: number[];
  pivotBars?: Array<{ name: string; value: number }>;
  indexLabel?: string;
  staticComparisonLayers?: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle?: (id: StaticAoiChartLayerId) => void;
  staticMultiLineLabels?: string[];
  staticMultiLineDatasets?: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst?: boolean;
};

export function SatelliteMapAnalysisToolbar({
  mapTool,
  onMapTool,
  hasClearableDrawing = false,
  onClearDrawing,
  hasAoi,
  staticChartsOpen,
  onToggleStaticCharts,
  embedded = false,
  chartsCompact = false,
  className = '',
  weeklyMeans = [],
  pivotBars = [],
  indexLabel = '',
  staticComparisonLayers = [],
  onStaticComparisonLayerToggle,
  staticMultiLineLabels = [],
  staticMultiLineDatasets = [],
  staticMultiLineHasLst = false,
}: SatelliteMapAnalysisToolbarProps) {
  return (
    <SatelliteContextualAnalysisDock
      variant={embedded ? 'embedded' : 'map'}
      className={[embedded ? 'si-map-analysis-toolbar--embedded' : '', className.trim()].filter(Boolean).join(' ')}
      mapTool={mapTool}
      onMapTool={onMapTool}
      hasClearableDrawing={hasClearableDrawing}
      onClearDrawing={onClearDrawing}
      hasAoi={hasAoi}
      staticChartsOpen={staticChartsOpen}
      onToggleStaticCharts={onToggleStaticCharts}
      chartsCompact={chartsCompact}
      weeklyMeans={weeklyMeans}
      pivotBars={pivotBars}
      indexLabel={indexLabel}
      staticMultiLineLabels={staticMultiLineLabels}
      staticMultiLineDatasets={staticMultiLineDatasets}
      staticMultiLineHasLst={staticMultiLineHasLst}
      staticComparisonLayers={staticComparisonLayers}
      onStaticComparisonLayerToggle={onStaticComparisonLayerToggle}
    />
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
  /** @deprecated Map uses contextual dock; flag ignored. */
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
  /** With `mapLoaded`, portals the contextual dock into `mapboxgl-canvas-container` for a true in-map overlay. */
  mapRef?: RefObject<any>;
  mapLoaded?: boolean;
  /** When false, the right-rail map toolbox is omitted (timeline and other chrome still render). */
  showMapToolbox?: boolean;
  onProcessingWorkflowNavigate?: (sectionId: SmartProcessingSectionId) => void;
  processingDropdownOpen?: boolean;
  onMapToolboxEmbedHost?: (el: HTMLDivElement | null) => void;
  onToolboxPanelClose?: () => void;
  /** Layers tool → Main tab: add layer + Added layers (optional; parent provides memoized JSX). */
  mapToolboxLayersMain?: ReactNode;
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
    weeklyMeans,
    pivotBars,
    indexLabel,
    staticMultiLineLabels,
    staticMultiLineDatasets,
    staticMultiLineHasLst,
    staticComparisonLayers,
    onStaticComparisonLayerToggle,
    mapRef,
    mapLoaded = false,
    showMapToolbox = true,
    onProcessingWorkflowNavigate,
    processingDropdownOpen = false,
    onMapToolboxEmbedHost,
    onToolboxPanelClose,
    mapToolboxLayersMain,
  } = props;

  const activeFull =
    weeklyChips.find(c => c.id === activeChipId)?.fullDate ??
    weeklyChips[0]?.fullDate ??
    '';

  const contextualDock = showMapToolbox ? (
    <SatelliteContextualAnalysisDock
      variant="map"
      mapTool={mapTool}
      onMapTool={onMapTool}
      hasClearableDrawing={hasClearableDrawing}
      onClearDrawing={onClearDrawing}
      hasAoi={hasAoi}
      staticChartsOpen={staticChartsOpen}
      onToggleStaticCharts={onToggleStaticCharts}
      indexLabel={indexLabel}
      staticMultiLineLabels={staticMultiLineLabels}
      staticMultiLineDatasets={staticMultiLineDatasets}
      staticMultiLineHasLst={staticMultiLineHasLst}
      staticComparisonLayers={staticComparisonLayers}
      onStaticComparisonLayerToggle={onStaticComparisonLayerToggle}
      weeklyMeans={weeklyMeans}
      pivotBars={pivotBars}
      sparkPathBuilder={sparkPath}
      onProcessingWorkflowNavigate={onProcessingWorkflowNavigate}
      processingDropdownOpen={processingDropdownOpen}
      onMapToolboxEmbedHost={onMapToolboxEmbedHost}
      onToolboxPanelClose={onToolboxPanelClose}
      mapToolboxLayersMain={mapToolboxLayersMain}
    />
  ) : null;

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
