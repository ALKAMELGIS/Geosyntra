import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { LiveAoiAnalysisStatus } from '../hooks/useLiveAoiSpectralAnalysis';
import { liveAoiDisplayLabel } from '../utils/liveAoiEnvironmentalLayers';
import { formatAoiCentroid, reverseAoiPlace } from '../utils/aoiReverseGeocode';
import {
  computeAoiZonalAnalytics,
  liveRasterIndexStats,
  roundIndexDisplay,
  type SiAoiRasterPixelSample,
  type SiAoiZonalAnalytics,
} from '../utils/siAoiZonalStats';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from '../utils/staticAoiChartTypes';
import './SiAoiMapInsightPopup.css';

export type SiAoiMapInsightPopupProps = {
  areaHa: number;
  centroid: [number, number];
  activeLayerId: StaticAoiChartLayerId;
  analytics: SiAoiZonalAnalytics | null;
  rasterSample: SiAoiRasterPixelSample | null;
  feature?: GeoJSON.Feature | null;
  status: LiveAoiAnalysisStatus;
  mapboxToken?: string;
  highlightLayerIds?: StaticAoiChartLayerId[];
  /** Visible WMS / RS layer title (when id alone does not encode the index). */
  layerDisplayLabel?: string;
};

function formatHaDisplay(ha: number): { primary: string; secondary: string } {
  if (!Number.isFinite(ha) || ha <= 0) {
    return { primary: '—', secondary: '' };
  }
  const m2 = ha * 10000;
  const haStr =
    ha >= 1000 ? ha.toFixed(1) : ha >= 100 ? ha.toFixed(2) : ha >= 1 ? ha.toFixed(3) : ha.toFixed(4);
  const m2Str =
    m2 >= 10_000 ? Math.round(m2).toLocaleString('en-US') : (Math.round(m2 * 10) / 10).toLocaleString('en-US');
  return { primary: `${haStr} ha`, secondary: `${m2Str} m²` };
}

type LiveIndexStats = {
  mean: number;
  min: number;
  max: number;
  source: 'raster' | 'timeline';
};

export function SiAoiMapInsightPopup({
  areaHa,
  centroid,
  activeLayerId,
  analytics: analyticsProp,
  rasterSample,
  feature,
  status,
  mapboxToken,
  highlightLayerIds,
  layerDisplayLabel,
}: SiAoiMapInsightPopupProps) {
  const [place, setPlace] = useState<{ region?: string; country?: string }>({});

  useEffect(() => {
    let cancelled = false;
    void reverseAoiPlace(centroid[0], centroid[1], mapboxToken).then(p => {
      if (!cancelled) setPlace(p);
    });
    return () => {
      cancelled = true;
    };
  }, [centroid[0], centroid[1], mapboxToken]);

  const analytics = useMemo(() => {
    if (analyticsProp?.dataSource === 'raster') return analyticsProp;
    if (rasterSample && feature?.geometry) {
      return computeAoiZonalAnalytics({
        feature,
        aoiKey: null,
        layerIds: highlightLayerIds ?? [activeLayerId],
        weekIdx: 0,
        nWeeks: 1,
        anchorWeeklyMean: 0,
        analysisDateIso: analyticsProp?.analysisDateIso ?? new Date().toISOString().slice(0, 10),
        rasterSample,
        allowSyntheticFallback: false,
      });
    }
    return analyticsProp;
  }, [analyticsProp, rasterSample, feature, highlightLayerIds, activeLayerId]);

  const liveStats = useMemo((): LiveIndexStats | null => {
    const fromRaster = liveRasterIndexStats(rasterSample, activeLayerId);
    if (fromRaster) {
      return { ...fromRaster, source: 'raster' };
    }
    if (analytics?.dataSource === 'raster') {
      const indexZonal = analytics.indices[activeLayerId];
      if (indexZonal && Number.isFinite(indexZonal.mean)) {
        return {
          mean: indexZonal.mean,
          min: indexZonal.min,
          max: indexZonal.max,
          source: 'raster',
        };
      }
    }
    return null;
  }, [analytics, rasterSample, activeLayerId]);

  const layerLabel =
    layerDisplayLabel?.trim() ||
    STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === activeLayerId)?.label ||
    liveAoiDisplayLabel(activeLayerId);
  const areaFmt = formatHaDisplay(areaHa);
  const loading =
    (status === 'loading' || status === 'idle') && !liveStats && analytics?.dataSource !== 'raster';
  const engineUnavailable = status === 'unavailable' && !liveStats;
  const coords = formatAoiCentroid(centroid[0], centroid[1]);

  const stat = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) ? roundIndexDisplay(value, activeLayerId) : '—';

  function IndexStat({
    kind,
    label,
    value,
    arrowIcon,
  }: {
    kind: 'max' | 'mean' | 'min';
    label: string;
    value: string;
    arrowIcon: string;
  }) {
    return (
      <motion.div
        className={`si-aoi-insight__stat si-aoi-insight__stat--${kind}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: kind === 'max' ? 0 : kind === 'mean' ? 0.04 : 0.08 }}
      >
        <span className="si-aoi-insight__stat-label">{label}</span>
        <span className="si-aoi-insight__stat-value">
          <i className={`fa-solid ${arrowIcon} si-aoi-insight__stat-arr`} aria-hidden />
          <strong className="si-aoi-insight__stat-num" dir="ltr">
            {value}
          </strong>
        </span>
      </motion.div>
    );
  }

  return (
    <div className="si-aoi-insight">
      <div className="si-aoi-insight__hero">
        <span className="si-aoi-insight__hero-k">Total area</span>
        <div className="si-aoi-insight__hero-v" dir="ltr">
          <strong>{areaFmt.primary}</strong>
          {areaFmt.secondary ? <span className="si-aoi-insight__hero-sub">{areaFmt.secondary}</span> : null}
        </div>
      </div>

      <div className="si-aoi-insight__geo">
        <div className="si-aoi-insight__geo-row">
          <span>Coordinates</span>
          <em dir="ltr">{coords}</em>
        </div>
        <div className="si-aoi-insight__geo-row">
          <span>Region</span>
          <em>{place.region || '—'}</em>
        </div>
        <div className="si-aoi-insight__geo-row">
          <span>Country</span>
          <em>{place.country || '—'}</em>
        </div>
      </div>

      <div className="si-aoi-insight__spectral">
        <div className="si-aoi-insight__spectral-head">
          <span className="si-aoi-insight__spectral-k">AOI data · Live layer index</span>
          <span className="si-aoi-insight__spectral-layer">{layerLabel}</span>
        </div>

        {loading ? (
          <p className="si-aoi-insight__loading">
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Sampling live pixels…
          </p>
        ) : (
          <div className="si-aoi-insight__stats-grid">
            <IndexStat kind="max" label="Max" value={stat(liveStats?.max)} arrowIcon="fa-arrow-up" />
            <IndexStat kind="mean" label="Mean" value={stat(liveStats?.mean)} arrowIcon="fa-minus" />
            <IndexStat kind="min" label="Min" value={stat(liveStats?.min)} arrowIcon="fa-arrow-down" />
          </div>
        )}

        {liveStats?.source === 'raster' ? (
          <p className="si-aoi-insight__live-badge">
            <span className="si-aoi-insight__live-dot" aria-hidden />
            Live · AOI-clipped raster pixels
          </p>
        ) : engineUnavailable ? (
          <p className="si-aoi-insight__hint">Start analysis engine for live pixel stats</p>
        ) : status === 'error' ? (
          <p className="si-aoi-insight__hint">Sampling failed — adjust date or AOI</p>
        ) : !loading ? (
          <p className="si-aoi-insight__hint">No pixels — check AOI &amp; date</p>
        ) : null}
      </div>
    </div>
  );
}
