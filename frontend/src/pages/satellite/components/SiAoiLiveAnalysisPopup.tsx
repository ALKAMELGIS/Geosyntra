import { useMemo, useState, type ReactNode } from 'react';
import type { LiveAoiAnalysisStatus } from '../hooks/useLiveAoiSpectralAnalysis';
import { computeLandCoverFromRasterLayers } from '../utils/liveAoiLandCover';
import type {
  SiAoiIndexHealthBreakdown,
  SiAoiRasterPixelSample,
  SiAoiZonalAnalytics,
  SiAoiZonalIndexStats,
} from '../utils/siAoiZonalStats';
import { computeAoiZonalAnalytics, roundIndexDisplay } from '../utils/siAoiZonalStats';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from '../utils/staticAoiChartTypes';
import './SiAoiLiveAnalysisPopup.css';

export type SiAoiLiveAnalysisPopupProps = {
  analytics: SiAoiZonalAnalytics | null;
  indexHealth: SiAoiIndexHealthBreakdown | null;
  rasterSample: SiAoiRasterPixelSample | null;
  activeLayerId: StaticAoiChartLayerId;
  status: LiveAoiAnalysisStatus;
  error?: string | null;
  areaDisplay: ReactNode;
  highlightLayerIds?: StaticAoiChartLayerId[];
  /** Required to rebuild analytics from raster when parent map omits synthetic rows */
  feature?: GeoJSON.Feature | null;
};

function formatResolution(m: number | null): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return '—';
  if (m >= 10) return `${m.toFixed(1)} m`;
  return `${m.toFixed(2)} m`;
}

function formatHa(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (n >= 10) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function spectralValueToneClass(tone: 'high' | 'medium' | 'low'): string {
  if (tone === 'high') return 'si-live-popup__value--good';
  if (tone === 'medium') return 'si-live-popup__value--mid';
  return 'si-live-popup__value--poor';
}

function PopupSection({
  id,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="si-live-popup__section">
      <button
        type="button"
        className="si-live-popup__section-head"
        aria-expanded={open}
        aria-controls={`si-live-section-${id}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="si-live-popup__section-title">{title}</span>
        {badge ? <span className="si-live-popup__section-badge">{badge}</span> : null}
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
      </button>
      {open ? (
        <div id={`si-live-section-${id}`} className="si-live-popup__section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="si-live-popup__metric-row">
      <span className="si-live-popup__metric-k">{label}</span>
      <span className="si-live-popup__metric-v" dir="ltr">
        {value}
      </span>
    </div>
  );
}

function IndexStatsGrid({ layerId, st }: { layerId: StaticAoiChartLayerId; st: SiAoiZonalIndexStats }) {
  return (
    <div className="si-live-popup__index-grid">
      <span>
        <em>Mean</em> {roundIndexDisplay(st.mean, layerId)}
      </span>
      <span>
        <em>Min</em> {roundIndexDisplay(st.min, layerId)}
      </span>
      <span>
        <em>Max</em> {roundIndexDisplay(st.max, layerId)}
      </span>
      {st.median != null && Number.isFinite(st.median) ? (
        <span>
          <em>Median</em> {roundIndexDisplay(st.median, layerId)}
        </span>
      ) : null}
      {st.std != null && Number.isFinite(st.std) ? (
        <span>
          <em>Std</em> {roundIndexDisplay(st.std, layerId)}
        </span>
      ) : null}
    </div>
  );
}

function HistogramMini({
  bins,
  layerId,
}: {
  bins: Array<{ binStart: number; binEnd: number; count: number }>;
  layerId: StaticAoiChartLayerId;
}) {
  const max = Math.max(...bins.map(b => b.count), 1);
  return (
    <div className="si-live-popup__histogram" role="img" aria-label="Pixel value histogram">
      {bins.map((b, i) => (
        <div
          key={i}
          className="si-live-popup__hist-bar"
          style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
          title={`${roundIndexDisplay(b.binStart, layerId)} – ${roundIndexDisplay(b.binEnd, layerId)}: ${b.count}`}
        />
      ))}
    </div>
  );
}

export function SiAoiLiveAnalysisPopup({
  analytics: analyticsProp,
  indexHealth,
  rasterSample,
  activeLayerId,
  status,
  error,
  areaDisplay,
  highlightLayerIds,
  feature,
}: SiAoiLiveAnalysisPopupProps) {
  const analytics = useMemo(() => {
    if (analyticsProp?.dataSource === 'raster') return analyticsProp;
    if (rasterSample && feature?.geometry) {
      const rebuilt = computeAoiZonalAnalytics({
        feature,
        aoiKey: null,
        layerIds: highlightLayerIds ?? ['NDVI', 'NDWI', 'SAVI', 'EVI', 'NDMI', 'NDBI'],
        weekIdx: 0,
        nWeeks: 1,
        anchorWeeklyMean: 0,
        analysisDateIso: analyticsProp?.analysisDateIso ?? new Date().toISOString().slice(0, 10),
        rasterSample,
        allowSyntheticFallback: false,
      });
      if (rebuilt) return rebuilt;
    }
    return analyticsProp;
  }, [analyticsProp, rasterSample, feature, highlightLayerIds]);

  const isRaster = analytics?.dataSource === 'raster' && Boolean(rasterSample);
  const isTimelineAnchored = analytics?.dataSource === 'synthetic' && Boolean(analytics?.indices);
  const hasDisplayableAnalytics = Boolean(
    analytics && Object.keys(analytics.indices ?? {}).length > 0,
  );
  const loading = status === 'loading' && !hasDisplayableAnalytics;
  const blocked =
    !hasDisplayableAnalytics && (status === 'error' || status === 'unavailable');

  const layerIds = useMemo(() => {
    if (highlightLayerIds?.length) return highlightLayerIds;
    if (analytics?.indices) {
      return Object.keys(analytics.indices) as StaticAoiChartLayerId[];
    }
    return ['NDVI', 'NDWI', 'SAVI', 'EVI', 'NDMI', 'NDBI'] as StaticAoiChartLayerId[];
  }, [highlightLayerIds, analytics?.indices]);

  const landCover = useMemo(() => {
    if (!rasterSample?.layers) return null;
    return computeLandCoverFromRasterLayers(rasterSample.layers);
  }, [rasterSample]);

  const confidencePct = useMemo(() => {
    if (!analytics?.pixelCount) return null;
    return Math.round((analytics.validPixelCount / Math.max(1, analytics.pixelCount)) * 100);
  }, [analytics]);

  const healthRows = indexHealth?.rows ?? [];
  const activeMeta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === activeLayerId);

  if (loading) {
    return (
      <div className="si-live-popup__state" aria-live="polite">
        <div className="si-live-popup__skeleton si-live-popup__skeleton--title" />
        <div className="si-live-popup__skeleton si-live-popup__skeleton--row" />
        <div className="si-live-popup__skeleton si-live-popup__skeleton--row" />
        <div className="si-live-popup__skeleton si-live-popup__skeleton--block" />
        <p className="si-live-popup__status-msg">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Sampling Sentinel-2 pixels inside AOI…
        </p>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="si-live-popup__state si-live-popup__state--error" role="alert">
        <p>
          {error ||
            'Run the analysis engine (port 8000) for Sentinel-2 pixel sampling, or generate a timeline for week-anchored AOI metrics.'}
        </p>
      </div>
    );
  }

  if (!analytics && !loading) {
    return (
      <p className="si-live-popup__status-msg">Draw or select a polygon AOI to run live spectral analysis.</p>
    );
  }

  return (
    <div className="si-live-popup">
      {isRaster ? (
        <p className="si-live-popup__source">
          <span className="si-live-popup__live-dot" aria-hidden />
          Live raster pixels · Sentinel-2 STAC
        </p>
      ) : isTimelineAnchored ? (
        <p className="si-live-popup__source si-live-popup__source--timeline">
          <span className="si-live-popup__live-dot" aria-hidden />
          Live layer · timeline week · AOI grid
        </p>
      ) : null}

      <PopupSection id="info" title="AOI information" defaultOpen>
        <div className="si-live-popup__area-block">
          <span className="si-live-popup__area-label">Total area</span>
          <span className="si-live-popup__area-value">{areaDisplay}</span>
        </div>
        <MetricRow label="Pixel count" value={analytics?.pixelCount.toLocaleString('en-US') ?? '—'} />
        <MetricRow label="Valid pixels" value={analytics?.validPixelCount.toLocaleString('en-US') ?? '—'} />
        <MetricRow label="Analysis date" value={analytics?.analysisDateIso ?? '—'} />
        <MetricRow label="Resolution (approx.)" value={formatResolution(analytics?.approxResolutionM ?? null)} />
      </PopupSection>

      {healthRows.length > 0 ? (
        <PopupSection
          id="health"
          title="Vegetation health"
          badge={activeMeta?.label ?? activeLayerId}
          defaultOpen
        >
          <p className="si-live-popup__section-lead">
            {indexHealth?.layerLabel} mean {roundIndexDisplay(indexHealth?.primaryMean ?? NaN, activeLayerId)} ·
            tertiles from AOI pixels
          </p>
          <ul className="si-live-popup__health-list" role="list">
            {[...healthRows].reverse().map(row => (
              <li key={row.band} className="si-live-popup__health-item">
                <span className="si-live-popup__health-name">
                  <span className="si-live-popup__swatch" style={{ backgroundColor: row.color }} aria-hidden />
                  {row.label.toUpperCase()}
                </span>
                <span className={`si-live-popup__health-value ${spectralValueToneClass(row.tone)}`} dir="ltr">
                  <span>{row.pct.toFixed(1)}%</span>
                  <span className="si-live-popup__sep">·</span>
                  <span>{formatHa(row.areaHa)} ha</span>
                  <span className="si-live-popup__sep">·</span>
                  <span>μ {roundIndexDisplay(row.meanIndex, activeLayerId)}</span>
                </span>
              </li>
            ))}
          </ul>
        </PopupSection>
      ) : null}

      {landCover ? (
        <PopupSection id="cover" title="Land cover metrics" defaultOpen={false}>
          <MetricRow label="Vegetation" value={`${landCover.vegetationPct.toFixed(1)}%`} />
          <MetricRow label="Water" value={`${landCover.waterPct.toFixed(1)}%`} />
          <MetricRow label="Urban / built-up" value={`${landCover.urbanPct.toFixed(1)}%`} />
          <MetricRow label="Bare soil" value={`${landCover.soilPct.toFixed(1)}%`} />
          {landCover.otherPct > 0.5 ? (
            <MetricRow label="Other" value={`${landCover.otherPct.toFixed(1)}%`} />
          ) : null}
        </PopupSection>
      ) : null}

      <PopupSection id="spectral" title="Spectral analysis" badge="AOI mean">
        {layerIds.map(id => {
          const opt = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id);
          const st = analytics?.indices[id];
          if (!opt || !st) return null;
          const isActive = id === activeLayerId;
          return (
            <div
              key={id}
              className={`si-live-popup__index-block${isActive ? ' si-live-popup__index-block--active' : ''}`}
            >
              <div className="si-live-popup__index-head">{opt.label}</div>
              <IndexStatsGrid layerId={id} st={st} />
            </div>
          );
        })}
      </PopupSection>

      {rasterSample?.histograms?.[activeLayerId]?.length ? (
        <PopupSection id="hist" title="Live histogram" badge={activeMeta?.label} defaultOpen={false}>
          <HistogramMini bins={rasterSample.histograms[activeLayerId]!} layerId={activeLayerId} />
        </PopupSection>
      ) : null}

      <PopupSection id="confidence" title="Confidence" defaultOpen={false}>
        <MetricRow
          label="Valid pixel ratio"
          value={confidencePct != null ? `${confidencePct}%` : '—'}
        />
        <MetricRow
          label="Data source"
          value={isRaster ? 'AOI-clipped STAC raster' : isTimelineAnchored ? 'Timeline week · live WMS layer' : '—'}
        />
        {rasterSample?.resolutionM ? (
          <MetricRow label="Sample resolution" value={formatResolution(rasterSample.resolutionM)} />
        ) : null}
      </PopupSection>
    </div>
  );
}
