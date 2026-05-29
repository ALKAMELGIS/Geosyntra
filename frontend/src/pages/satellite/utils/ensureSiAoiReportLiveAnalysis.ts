import { mpcZonalSample } from '../../../lib/mpcPlanetaryApi';
import {
  awaitSiAoiReportLiveAnalysis,
  getSiAoiReportAnalysisEntry,
  setSiAoiReportAnalysisEntry,
} from '../store/siAoiReportAnalysisStore';
import {
  buildSiAoiReportLiveAnalysisSnapshot,
  siAoiReportLiveAnalysisFingerprint,
  type SiAoiReportLiveAnalysisSnapshot,
} from './siAoiReportLiveAnalysisSnapshot';
import {
  buildAoiZonalDatetimeRange,
  inferStaticAoiChartLayerFromWmsName,
  mpcResultToRasterPixelSample,
  resolveAoiZonalWeekContext,
} from './siAoiZonalStats';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';

export type EnsureSiAoiReportLiveAnalysisOpts = {
  aoiId: string;
  aoiName: string;
  feature: GeoJSON.Feature;
  activeWmsLayer: string;
  indexId: StaticAoiChartLayerId;
  analysisDateIso: string;
  analysisEngineBaseUrl: string;
  layerIds: StaticAoiChartLayerId[];
  weeklyComposites: readonly WeeklyCompositeLite[];
  catalogUrl: string;
  maxCloudCover?: number;
  /** If false, only wait on store — do not trigger a new MPC fetch */
  allowFetch?: boolean;
  waitTimeoutMs?: number;
};

/**
 * Returns a frozen live-analysis snapshot for report export.
 * Waits for in-flight MPC sampling or runs a dedicated fetch when allowed.
 */
export async function ensureSiAoiReportLiveAnalysis(
  opts: EnsureSiAoiReportLiveAnalysisOpts,
): Promise<SiAoiReportLiveAnalysisSnapshot | null> {
  const g = opts.feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;

  const fingerprint = siAoiReportLiveAnalysisFingerprint({
    feature: opts.feature,
    analysisDateIso: opts.analysisDateIso,
    layerIds: opts.layerIds,
  });

  const existing = getSiAoiReportAnalysisEntry(opts.aoiId);
  if (
    existing?.status === 'ready' &&
    existing.snapshot &&
    existing.fingerprint === fingerprint
  ) {
    return existing.snapshot;
  }

  if (existing?.status === 'loading' && existing.fingerprint === fingerprint) {
    return awaitSiAoiReportLiveAnalysis(opts.aoiId, {
      timeoutMs: opts.waitTimeoutMs ?? 120_000,
      fingerprint,
    });
  }

  if (!opts.analysisEngineBaseUrl?.trim()) {
    setSiAoiReportAnalysisEntry(opts.aoiId, {
      aoiName: opts.aoiName,
      status: 'unavailable',
      snapshot: null,
      errorMessage: 'Analysis engine URL not configured.',
      fingerprint,
    });
    return null;
  }

  if (opts.allowFetch === false) {
    return awaitSiAoiReportLiveAnalysis(opts.aoiId, {
      timeoutMs: opts.waitTimeoutMs ?? 15_000,
      fingerprint,
    });
  }

  const activeLayerId =
    opts.indexId || inferStaticAoiChartLayerFromWmsName(opts.activeWmsLayer || '');
  const mpcLayerIds = opts.layerIds.filter(id => id !== 'LST');

  setSiAoiReportAnalysisEntry(opts.aoiId, {
    aoiName: opts.aoiName,
    status: 'loading',
    snapshot: null,
    errorMessage: null,
    fingerprint,
  });

  try {
    const weekCtx = resolveAoiZonalWeekContext(
      opts.weeklyComposites,
      opts.analysisDateIso,
      opts.analysisDateIso,
      activeLayerId,
    );
    const datetime = buildAoiZonalDatetimeRange(weekCtx, opts.weeklyComposites, '', '');
    const result = await mpcZonalSample(opts.analysisEngineBaseUrl, {
      aoi: opts.feature,
      datetime,
      layer_ids: mpcLayerIds,
      catalog_url: opts.catalogUrl,
      clip_to_aoi: true,
      max_cloud_cover: opts.maxCloudCover,
      max_pixels: 9000,
      resolution: 20,
    });
    const sample = mpcResultToRasterPixelSample(result, opts.layerIds);
    if (!sample) {
      setSiAoiReportAnalysisEntry(opts.aoiId, {
        status: 'error',
        snapshot: null,
        errorMessage: 'MPC zonal sample returned no pixels.',
        fingerprint,
      });
      return null;
    }
    const snap = buildSiAoiReportLiveAnalysisSnapshot({
      aoiId: opts.aoiId,
      aoiName: opts.aoiName,
      feature: opts.feature,
      rasterSample: sample,
      activeLayerId,
      analysisDateIso: opts.analysisDateIso,
      layerIds: opts.layerIds,
    });
    if (!snap) {
      setSiAoiReportAnalysisEntry(opts.aoiId, {
        status: 'error',
        snapshot: null,
        errorMessage: 'Could not build live analysis snapshot from raster.',
        fingerprint,
      });
      return null;
    }
    setSiAoiReportAnalysisEntry(opts.aoiId, {
      status: 'ready',
      snapshot: snap,
      errorMessage: null,
      fingerprint,
    });
    return snap;
  } catch (e) {
    setSiAoiReportAnalysisEntry(opts.aoiId, {
      status: 'error',
      snapshot: null,
      errorMessage: (e as Error)?.message ?? 'Live analysis fetch failed.',
      fingerprint,
    });
    return null;
  }
}
