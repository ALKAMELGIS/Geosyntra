/**
 * AOI multi-layer chart datasets from real raster zonal means (MPC pixel sampling inside AOI).
 * Timeline labels align with {@link WeeklyComposite} weeks; gaps stay null when no raster exists.
 */
import { formatStaticChartWeekLabel } from './staticAoiLayerSynthetic';

export type {
  StaticAoiChartLayerId,
  WeeklyCompositeLite,
} from './staticAoiChartTypes';
export {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  STATIC_AOI_CHART_LAYER_INLINE_IDS,
  defaultStaticAoiComparisonLayers,
  getStaticAoiChartAoiKey,
  sortStaticAoiChartLayerIds,
} from './staticAoiChartTypes';
export { formatStaticChartWeekLabel, staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';

import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';

function metaFor(layerId: string) {
  return STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === layerId) ?? STATIC_AOI_CHART_LAYER_OPTIONS[0]!;
}

const DATASET_COLORS = ['#4f46e5', '#0d9488', '#ca8a04', '#b91c1c', '#7c3aed', '#15803d', '#0369a1'];

/** Stable series color for a layer id (matches AOI static multi-layer chart). */
export function staticAoiChartColorForLayer(layerId: StaticAoiChartLayerId): string {
  const idx = STATIC_AOI_CHART_LAYER_OPTIONS.findIndex(o => o.id === layerId);
  return DATASET_COLORS[(idx >= 0 ? idx : 0) % DATASET_COLORS.length]!;
}

export function buildStaticAoiMultiChartDatasets(
  weekly: WeeklyCompositeLite[],
  layerIds: StaticAoiChartLayerId[],
  /** AOI-masked weekly means from MPC raster sampling — null gaps when a week has no data. */
  realWeeklyMeansByLayer: Partial<Record<StaticAoiChartLayerId, (number | null)[]>> = {},
): {
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: (number | null)[];
    borderColor: string;
    backgroundColor: string;
    yAxisID: string;
  }>;
  hasRealData: boolean;
} {
  if (!weekly.length || !layerIds.length) {
    return { labels: [], datasets: [], hasRealData: false };
  }
  const labels = weekly.map(w => formatStaticChartWeekLabel(w.startDate));
  let hasRealData = false;
  const datasets = layerIds.map((id, di) => {
    const opt = metaFor(id);
    const color = DATASET_COLORS[di % DATASET_COLORS.length]!;
    const series = realWeeklyMeansByLayer[id];
    const data = weekly.map((_, i) => {
      const v = series?.[i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        hasRealData = true;
        return v;
      }
      return null;
    });
    return {
      id,
      label: opt.label,
      data,
      borderColor: color,
      backgroundColor: `${color}22`,
      yAxisID: id === 'LST' ? 'yLST' : 'yIndex',
    };
  });
  return { labels, datasets, hasRealData };
}
