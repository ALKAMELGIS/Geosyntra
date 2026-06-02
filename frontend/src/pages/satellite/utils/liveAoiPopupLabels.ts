import { coverLabelsForLayer } from './siIndexClassAnalytics';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

const INDEX_ICONS: Record<StaticAoiChartLayerId, string> = {
  NDVI: 'fa-seedling',
  NDWI: 'fa-water',
  NDMI: 'fa-droplet',
  SAVI: 'fa-leaf',
  EVI: 'fa-tree',
  NDSI: 'fa-snowflake',
  NDBI: 'fa-city',
  GNDVI: 'fa-spa',
  LST: 'fa-temperature-half',
};

export function indexIconForLayer(layerId: StaticAoiChartLayerId): string {
  return INDEX_ICONS[layerId] ?? 'fa-layer-group';
}

/** Engineer-facing cover labels — NDVI family emphasizes crop vs bare ground. */
export function coverDisplayLabelsForLayer(layerId: StaticAoiChartLayerId): {
  positive: string;
  negative: string;
  shortPositive: string;
  shortNegative: string;
} {
  switch (layerId) {
    case 'NDVI':
    case 'SAVI':
    case 'EVI':
    case 'GNDVI':
      return {
        positive: 'Cultivated (active vegetation / crop signal)',
        negative: 'Non-cultivated (bare soil, built, water)',
        shortPositive: 'Cultivated',
        shortNegative: 'Non-cultivated',
      };
    case 'NDWI':
      return {
        positive: 'Water / high moisture',
        negative: 'Dry surface',
        shortPositive: 'Moist',
        shortNegative: 'Dry',
      };
    case 'NDMI':
      return {
        positive: 'Moist canopy / soil',
        negative: 'Low moisture',
        shortPositive: 'Moist',
        shortNegative: 'Dry',
      };
    case 'LST':
      return {
        positive: 'Warm surface',
        negative: 'Cool surface',
        shortPositive: 'Warm',
        shortNegative: 'Cool',
      };
    default: {
      const base = coverLabelsForLayer(layerId);
      return {
        positive: base.positive,
        negative: base.negative,
        shortPositive: base.positive.split(' ')[0] ?? base.positive,
        shortNegative: base.negative.split(' ')[0] ?? base.negative,
      };
    }
  }
}
