import { useEffect, useMemo, useRef, useState } from 'react';
import { mpcZonalSample, type MpcZonalSampleResult } from '../../../lib/mpcPlanetaryApi';
import type { SiAoiSpectralProfileMini } from '../components/AoiSpectralProfileMiniChart';
import {
  buildLiveAoiMapChartSnapshot,
  type LiveAoiMapChartSnapshot,
} from '../utils/liveAoiMapChartSnapshot';
import {
  buildAoiZonalDatetimeRange,
  inferStaticAoiChartLayerFromWmsName,
  mpcResultToRasterPixelSample,
  resolveAoiZonalWeekContext,
  type SiAoiRasterPixelSample,
} from '../utils/siAoiZonalStats';
import {
  finitePixelValues,
  opticalLayerIdsForSpectralProfile,
  rasterPixelsToHeatGeoJson,
} from '../utils/liveAoiSpectralStats';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from '../utils/staticAoiChartTypes';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from '../utils/staticAoiChartTypes';

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
};

function buildSpectralProfileFromRaster(
  raster: SiAoiRasterPixelSample,
  activeLayerId: StaticAoiChartLayerId,
): SiAoiSpectralProfileMini | null {
  const ids = opticalLayerIdsForSpectralProfile(activeLayerId);
  const labels = ids.map(id => STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id)?.label ?? id);
  const values = ids.map(id => {
    const raw = raster.layers[id];
    const finite = finitePixelValues(raw);
    if (!finite.length) return NaN;
    return finite.reduce((a, b) => a + b, 0) / finite.length;
  });
  const finiteVals = values.filter(Number.isFinite);
  if (finiteVals.length < 2) {
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
        subtitle: `${activeLayerId} · ${activeVals.length} raster pixels`,
      };
    }
    return null;
  }
  return {
    mode: 'indices',
    values: values as number[],
    labels,
    yMin: Math.min(...finiteVals),
    yMax: Math.max(...finiteVals),
    subtitle: 'Six optical indices · AOI-clipped raster pixels',
  };
}

export function useLiveAoiSpectralAnalysis(opts: UseLiveAoiSpectralAnalysisOpts) {
  const [status, setStatus] = useState<LiveAoiAnalysisStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rasterSample, setRasterSample] = useState<SiAoiRasterPixelSample | null>(null);
  const [pixelCount, setPixelCount] = useState(0);
  const requestSeq = useRef(0);

  const activeLayerId = useMemo(
    () => inferStaticAoiChartLayerFromWmsName(opts.activeWmsLayer || opts.selectedIndex || 'NDVI'),
    [opts.activeWmsLayer, opts.selectedIndex],
  );

  const mpcLayerIds = useMemo(
    () => opts.layerIds.filter(id => id !== 'LST'),
    [opts.layerIds],
  );

  useEffect(() => {
    if (!opts.enabled) {
      setStatus('idle');
      setRasterSample(null);
      setError(null);
      return;
    }
    const geom = opts.feature?.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
      setStatus('idle');
      setRasterSample(null);
      setError(null);
      return;
    }
    if (!opts.analysisEngineBaseUrl?.trim()) {
      setStatus('unavailable');
      setRasterSample(null);
      setError('Start the analysis engine (VITE_ANALYSIS_ENGINE_URL) for real pixel statistics.');
      return;
    }
    if (!mpcLayerIds.length) {
      setStatus('error');
      setError('No optical layers selected for sampling.');
      return;
    }

    const seq = ++requestSeq.current;
    setStatus('loading');
    setError(null);

    const weekCtx = resolveAoiZonalWeekContext(
      opts.weeklyComposites,
      opts.analysisDateIso,
      opts.analysisDateIso,
      activeLayerId,
    );
    const datetime = buildAoiZonalDatetimeRange(weekCtx, opts.weeklyComposites, '', '');

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
        setRasterSample(sample);
        setPixelCount(result.pixel_count ?? sample.grid.length);
        setStatus('ready');
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
    opts.analysisDateIso,
    opts.weeklyComposites,
    opts.catalogUrl,
    opts.maxCloudCover,
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
    if (rasterSample && status === 'ready') {
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
        rasterSample,
        allowSyntheticFallback: false,
      });
      if (base) {
        const profile = buildSpectralProfileFromRaster(rasterSample, activeLayerId);
        return { ...base, spectralProfile: profile ?? base.spectralProfile, dataSource: 'raster' as const };
      }
    }
    if (status === 'unavailable' || status === 'error') {
      return buildLiveAoiMapChartSnapshot({
        feature: opts.feature,
        aoiKey: opts.aoiKey,
        activeWmsLayer: opts.activeWmsLayer,
        selectedIndex: opts.selectedIndex,
        analysisDateIso: analysisIso,
        savedFields: opts.savedFields,
        aoiFields: opts.aoiFields,
        drawnGeometry: opts.drawnGeometry,
        allowSyntheticFallback: false,
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
    rasterSample,
    heatGeoJson,
    status,
    activeLayerId,
  ]);

  const confidencePct = useMemo(() => {
    if (!rasterSample || !pixelCount) return null;
    const active = finitePixelValues(rasterSample.layers[activeLayerId]);
    if (!active.length) return null;
    return Math.round((active.length / Math.max(1, pixelCount)) * 100);
  }, [rasterSample, pixelCount, activeLayerId]);

  return {
    status,
    error,
    rasterSample,
    snapshot,
    heatGeoJson,
    activeLayerId,
    pixelCount,
    confidencePct,
    reload: () => {
      requestSeq.current += 1;
      setStatus('idle');
    },
  };
}
