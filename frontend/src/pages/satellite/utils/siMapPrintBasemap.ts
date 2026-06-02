import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiMapPrintBasemapMode } from './siMapPrintTypes';

export type { SiMapPrintBasemapMode };

export function siMapPrintBasemapLayerIds(map: MapboxMap): string[] {
  const layers = map.getStyle()?.layers ?? [];
  return layers
    .filter(l => {
      if (l.type === 'background') return true;
      if (l.type !== 'raster') return false;
      const src = 'source' in l && typeof l.source === 'string' ? l.source : '';
      return /^r\d+$/.test(src);
    })
    .map(l => l.id);
}

export async function siMapPrintSetBasemapLayersVisible(
  map: MapboxMap,
  visible: boolean,
): Promise<void> {
  const vis = visible ? 'visible' : 'none';
  for (const id of siMapPrintBasemapLayerIds(map)) {
    try {
      map.setLayoutProperty(id, 'visibility', vis);
    } catch {
      /* layer may not exist yet */
    }
  }
}
