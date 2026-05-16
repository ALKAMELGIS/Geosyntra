/**
 * AOI static multi-layer chart: builds per-week synthetic means per analysis layer
 * for temporal comparison (same timeline as {@link WeeklyComposite} strip).
 * With a polygon feature, values are zonal pixel means (aligned with Excel export / popups).
 */
import { computeAoiZonalWeeklyMeans } from './siAoiZonalStats';
import { formatStaticChartWeekLabel, staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';

export type {
  StaticAoiChartLayerId,
  WeeklyCompositeLite,
} from './staticAoiChartTypes';
export {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  STATIC_AOI_CHART_LAYER_INLINE_IDS,
  defaultStaticAoiComparisonLayers,
  sortStaticAoiChartLayerIds,
} from './staticAoiChartTypes';
export { formatStaticChartWeekLabel, staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';

import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';

function metaFor(layerId: string) {
  return STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === layerId) ?? STATIC_AOI_CHART_LAYER_OPTIONS[0]!;
}

const DATASET_COLORS = ['#4f46e5', '#0d9488', '#ca8a04', '#b91c1c', '#7c3aed', '#15803d', '#0369a1'];

export function buildStaticAoiMultiChartDatasets(
  weekly: WeeklyCompositeLite[],
  layerIds: StaticAoiChartLayerId[],
  aoiKey: string | null,
  /** When set, weekly means are zonal pixel averages (matches Excel / popups). */
  aoiFeature?: GeoJSON.Feature | null,
): {
  labels: string[];
  datasets: Array<{
    id: string;
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    yAxisID: string;
  }>;
} {
  if (!weekly.length || !layerIds.length) {
    return { labels: [], datasets: [] };
  }
  const n = weekly.length;
  const labels = weekly.map(w => formatStaticChartWeekLabel(w.startDate));
  const useZonal =
    aoiFeature?.geometry &&
    (aoiFeature.geometry.type === 'Polygon' || aoiFeature.geometry.type === 'MultiPolygon');
  let zonalByLayer: Partial<Record<StaticAoiChartLayerId, number[]>> | null = null;
  if (useZonal && aoiFeature) {
    zonalByLayer = {};
    for (const id of layerIds) {
      zonalByLayer[id] = computeAoiZonalWeeklyMeans(aoiFeature, aoiKey, id, weekly);
    }
  }
  const datasets = layerIds.map((id, di) => {
    const opt = metaFor(id);
    const color = DATASET_COLORS[di % DATASET_COLORS.length]!;
    const zonalSeries = zonalByLayer?.[id];
    const data = weekly.map((w, i) => {
      const z = zonalSeries?.[i];
      if (typeof z === 'number' && Number.isFinite(z)) return z;
      return staticAoiLayerMeanForWeek(id, i, n, aoiKey, w.mean);
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
  return { labels, datasets };
}
