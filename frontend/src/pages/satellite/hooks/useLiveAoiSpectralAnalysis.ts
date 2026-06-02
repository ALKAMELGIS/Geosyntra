import { useEffect, useMemo, useRef, useState } from 'react';
import { mpcZonalSample, type MpcZonalSampleResult } from '../../../lib/mpcPlanetaryApi';
import type { SiAoiSpectralProfileMini } from '../components/AoiSpectralProfileMiniChart';
import {
  buildLiveAoiMapChartSnapshot,
  type LiveAoiMapChartSnapshot,
} from '../utils/liveAoiMapChartSnapshot';
import {
  buildLiveAoiCacheKey,
  getLiveAoiCache,
  setLiveAoiCache,
} from '../utils/liveAoiAnalysisCache';
import { liveAoiDisplayLabel, mpcZonalApiLayerIdsFromPopup } from '../utils/liveAoiEnvironmentalLayers';
import {
  buildAoiZonalDatetimeRange,
  inferStaticAoiChartLayerFromWmsName,
  mpcResultToRasterPixelSample,
  resolveAoiZonalWeekContext,
  type SiAoiIndexHealthBreakdown,
  type SiAoiRasterPixelSample,
  type SiAoiZonalAnalytics,
} from '../utils/siAoiZonalStats';
import {
  finitePixelValues,
  opticalLayerIdsForSpectralProfile,
  rasterPixelsToHeatGeoJson,
} from '../utils/liveAoiSpectralStats';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from '../utils/staticAoiChartTypes';
import { useDebouncedValue } from './useDebouncedValue';

export type LiveAoiAnalysisStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export type UseLiveAoiSpectralAnalysisOpts = {
  enabled: boolean;
  analysisEngineBaseUrl: string;
  feature: GeoJSON.Feature | null;
  aoiKey: string | null;
  activeWmsLayer: string;
  selectedIndex: string;
  analysisDateIso: string;
  weeklyComposites: readonly WeeklyCompositeLite[];
  layerIds: StaticAoiChartLayerId[];
  catalogUrl?: string;
  maxCloudCover?: number;
  savedFields?: Array<{ id: string; name?: string; geometry: GeoJSON.Geometry }>;
  aoiFields?: Array<{ id: string; name: string; geometry: GeoJSON.Geometry }>;
  drawnGeometry?: GeoJSON.Feature | null;
  timelineIndexMean?: number | null;
  preloadedRasterSample?: SiAoiRasterPixelSample | null;
  precomputedZonal?: SiAoiZonalAnalytics | null;
  precomputedHealth?: SiAoiIndexHealthBreakdown | null;
  timelineStart?: string;
  timelineEnd?: string;
  liveMapIndexStats?: {
    layerId: StaticAoiChartLayerId;
    mean: number;
    min: number;
    max: number;
    std?: number;
  } | null;
};

function buildSpectralProfileFromRaster(
  raster: SiAoiRasterPixelSample,
  activeLayerId: StaticAoiChartLayerId,
): SiAoiSpectralProfileMini | null {
  const ids = opticalLayerIdsForSpectralProfile(activeLayerId);
  const labels = ids.map(id => liveAoiDisplayLabel(id));
  const values = ids.map(id => {
    const raw = raster.layers[id];
    const finite = finitePixelValues(raw);
    if (!finite.length) return NaN;
    return finite.reduce((a, b) => a + b, 0) / finite.length;
  });
  const finiteVals = values.filter(Number.isFinite);
  if (finiteVals.length >= 2) {
    return {
      mode: 'indices',
      values: values as number[],
      labels,
      yMin: Math.min(...finiteVals),
      yMax: Math.max(...finiteVals),
      subtitle: 'Environmental indices · AOI-clipped raster pixels',
    };
  }
  const activeVals = finitePixelValues(raster.layers[activeLayerId]);
  if (activeVals.length >= 6) {
    const sorted = [...activeVals].sort((a, b) => a - b);
    const step = Math.max(1, Math.ceil(sorted.length / 72));
    const sampled: number[] = [];
    for (let i = 0; i < sorted.length; i += step) sampled.push(sorted[i]!);
    return {
      mode: 'pixels',
      values: sampled,
      labels: [],
      yMin: Math.min(...sampled),
      yMax: Math.max(...sampled),
      subtitle: `${liveAoiDisplayLabel(activeLayerId)} · ${activeVals.length} raster pixels`,
    };
  }
  return null;
}

export function useLiveAoiSpectralAnalysis(opts: UseLiveAoiSpectralAnalysisOpts) {
  const [status, setStatus] = useState<LiveAoiAnalysisStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rasterSample, setRasterSample] = useState<SiAoiRasterPixelSample | null>(null);
  const [pixelCount, setPixelCount] = useState(0);
  const [updatedAtIso, setUpdatedAtIso] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const activeLayerId = useMemo(
    () =>
      inferStaticAoiChartLayerFromWmsName(
        opts.activeWmsLayer || opts.selectedIndex || '',
        opts.selectedIndex,
      ),
    [opts.activeWmsLayer, opts.selectedIndex],
  );

  const mpcLayerIds = useMemo(() => {
    const ids = opts.layerIds.length ? opts.layerIds : [activeLayerId];
    return mpcZonalApiLayerIdsFromPopup(ids.filter(id => id !== 'LST'));
  }, [opts.layerIds, activeLayerId]);

  const debouncedAoiKey = useDebouncedValue(opts.aoiKey, 420);
  const debouncedDate = useDebouncedValue(opts.analysisDateIso.slice(0, 10), 420);
  const debouncedLayerSig = useDebouncedValue(`${opts.activeWmsLayer}|${opts.selectedIndex}`, 280);

  useEffect(() => {
    if (!opts.enabled) {
      setStatus('idle');
      setRasterSample(null);
      setError(null);
      setUpdatedAtIso(null);
      return;
    }
    const geom = opts.feature?.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
      setStatus('idle');
      setRasterSample(null);
      setError(null);
      setUpdatedAtIso(null);
      return;
    }
    if (!opts.analysisEngineBaseUrl?.trim()) {
      setRasterSample(null);
      setStatus('unavailable');
      setError(
        'Analysis engine offline. Start analysis_engine (port 8000) or set VITE_ANALYSIS_ENGINE_URL.',
      );
      return;
    }
    if (!mpcLayerIds.length) {
      setStatus('error');
      setError('No spectral layers selected for sampling.');
      return;
    }

    const weekCtx = resolveAoiZonalWeekContext(
      opts.weeklyComposites,
      debouncedDate,
      debouncedDate,
      activeLayerId,
    );
    const datetime = buildAoiZonalDatetimeRange(
      weekCtx,
      opts.weeklyComposites,
      opts.timelineStart ?? '',
      opts.timelineEnd ?? '',
    );

    const cacheKey = debouncedAoiKey
      ? buildLiveAoiCacheKey({
          aoiKey: debouncedAoiKey,
          datetime,
          layerIds: mpcLayerIds,
          catalogUrl: opts.catalogUrl,
          maxCloudCover: opts.maxCloudCover,
          resolution: 20,
          wmsLayer: opts.activeWmsLayer,
          anchorIso: debouncedDate,
        })
      : '';

    const cached = cacheKey ? getLiveAoiCache(cacheKey) : null;
    if (cached?.raster?.grid?.length) {
      setRasterSample(cached.raster);
      setPixelCount(cached.result.pixel_count ?? cached.raster.grid.length);
      setStatus('ready');
      setError(null);
      setUpdatedAtIso(new Date(cached.fetchedAt).toISOString());
      return;
    }

    const seq = ++requestSeq.current;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const result: MpcZonalSampleResult = await mpcZonalSample(opts.analysisEngineBaseUrl, {
          aoi: opts.feature!,
          datetime,
          layer_ids: mpcLayerIds,
          catalog_url: opts.catalogUrl,
          clip_to_aoi: true,
          max_cloud_cover: opts.maxCloudCover,
          max_pixels: 9000,
          resolution: 20,
        });
        if (seq !== requestSeq.current) return;
        const sample = mpcResultToRasterPixelSample(result, mpcLayerIds);
        if (!sample) {
          setStatus('error');
          setRasterSample(null);
          setError('No valid pixels inside AOI for this date range.');
          return;
        }
        if (cacheKey) {
          setLiveAoiCache(cacheKey, { result, raster: sample, fetchedAt: Date.now() });
        }
        setRasterSample(sample);
        setPixelCount(result.pixel_count ?? sample.grid.length);
        setStatus('ready');
        setUpdatedAtIso(new Date().toISOString());
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setRasterSample(null);
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Raster sampling failed.');
      }
    })();
  }, [
    opts.enabled,
    opts.feature,
    opts.analysisEngineBaseUrl,
    opts.preloadedRasterSample,
    opts.timelineStart,
    opts.timelineEnd,
    opts.catalogUrl,
    opts.maxCloudCover,
    opts.weeklyComposites,
    debouncedAoiKey,
    debouncedDate,
    debouncedLayerSig,
    mpcLayerIds,
    activeLayerId,
  ]);

  const heatGeoJson = useMemo(() => {
    if (!rasterSample) return null;
    const vals = rasterSample.layers[activeLayerId];
    if (!vals?.length) return null;
    return rasterPixelsToHeatGeoJson(rasterSample.grid, vals);
  }, [rasterSample, activeLayerId]);

  const snapshot: LiveAoiMapChartSnapshot | null = useMemo(() => {
    if (!opts.enabled) return null;
    const analysisIso = opts.analysisDateIso.slice(0, 10);
    const raster = rasterSample ?? opts.preloadedRasterSample ?? null;
    const hasRaster = Boolean(raster?.grid?.length);

    if (hasRaster && (status === 'ready' || opts.preloadedRasterSample)) {
      const base = buildLiveAoiMapChartSnapshot({
        feature: opts.feature,
        aoiKey: opts.aoiKey,
        activeWmsLayer: opts.activeWmsLayer,
        selectedIndex: opts.selectedIndex,
        analysisDateIso: analysisIso,
        aoiHeatPointGeoJson: heatGeoJson,
        savedFields: opts.savedFields,
        aoiFields: opts.aoiFields,
        drawnGeometry: opts.drawnGeometry,
        rasterSample: raster,
        weeklyComposites: opts.weeklyComposites,
        timelineIndexMean: opts.timelineIndexMean,
        precomputedZonal: opts.precomputedZonal,
        precomputedHealth: opts.precomputedHealth,
        liveMapIndexStats: opts.liveMapIndexStats,
        allowSyntheticFallback: false,
        timelineStartIso: opts.timelineStart,
        timelineEndIso: opts.timelineEnd,
      });
      if (base) {
        const profile = buildSpectralProfileFromRaster(raster!, activeLayerId);
        return {
          ...base,
          spectralProfile: profile ?? base.spectralProfile,
          dataSource: 'raster' as const,
          updatedAtIso: updatedAtIso ?? base.updatedAtIso,
        };
      }
    }

    if (status === 'loading') return null;

    if (status === 'unavailable' || status === 'error' || !hasRaster) {
      return buildLiveAoiMapChartSnapshot({
        feature: opts.feature,
        aoiKey: opts.aoiKey,
        activeWmsLayer: opts.activeWmsLayer,
        selectedIndex: opts.selectedIndex,
        analysisDateIso: analysisIso,
        savedFields: opts.savedFields,
        aoiFields: opts.aoiFields,
        drawnGeometry: opts.drawnGeometry,
        weeklyComposites: opts.weeklyComposites,
        timelineIndexMean: opts.timelineIndexMean,
        precomputedZonal: opts.precomputedZonal,
        precomputedHealth: opts.precomputedHealth,
        liveMapIndexStats: opts.liveMapIndexStats,
        allowSyntheticFallback: false,
        timelineStartIso: opts.timelineStart,
        timelineEndIso: opts.timelineEnd,
      });
    }

    return null;
  }, [
    opts.enabled,
    opts.feature,
    opts.aoiKey,
    opts.activeWmsLayer,
    opts.selectedIndex,
    opts.analysisDateIso,
    opts.savedFields,
    opts.aoiFields,
    opts.drawnGeometry,
    opts.weeklyComposites,
    opts.timelineIndexMean,
    opts.precomputedZonal,
    opts.precomputedHealth,
    opts.preloadedRasterSample,
    opts.timelineStart,
    opts.timelineEnd,
    opts.liveMapIndexStats,
    rasterSample,
    heatGeoJson,
    status,
    activeLayerId,
    updatedAtIso,
  ]);

  const confidencePct = useMemo(() => {
    const sample = rasterSample ?? opts.preloadedRasterSample;
    if (!sample || !pixelCount) return null;
    const active = finitePixelValues(sample.layers[activeLayerId]);
    if (!active.length) return null;
    return Math.round((active.length / Math.max(1, pixelCount)) * 100);
  }, [rasterSample, opts.preloadedRasterSample, pixelCount, activeLayerId]);

  return {
    status,
    error,
    rasterSample,
    snapshot,
    heatGeoJson,
    activeLayerId,
    pixelCount,
    confidencePct,
    updatedAtIso,
    reload: () => {
      requestSeq.current += 1;
      setStatus('idle');
    },
  };
}
