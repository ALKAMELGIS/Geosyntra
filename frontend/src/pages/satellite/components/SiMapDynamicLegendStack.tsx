import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { mergeSymbologyUi } from '../utils/siWmsSymbologyModel';
import { SiWmsIndexClassificationLegend } from './SiWmsIndexClassificationLegend';
import { SiWmsLiveLayerLegend } from './SiWmsLiveLayerLegend';
import { SiMapVectorLayerLegend } from './SiMapVectorLayerLegend';
import type { SiMapDynamicLegendEntry } from '../utils/siMapDynamicLegendRegistry';

export type SiMapDynamicLegendStackProps = {
  mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>;
  mapLoaded: boolean;
  entries: SiMapDynamicLegendEntry[];
};

function resolveMapFromRef(
  mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>,
): MapboxMap | null {
  const raw = mapRef.current;
  if (!raw) return null;
  if (typeof (raw as { getMap?: () => MapboxMap }).getMap === 'function') {
    return (raw as { getMap: () => MapboxMap }).getMap() ?? null;
  }
  return raw as MapboxMap;
}

function resolveMapShell(map: MapboxMap | null): HTMLElement | null {
  if (!map) return null;
  const canvasHost = map.getCanvasContainer?.();
  if (!canvasHost) return null;
  return (canvasHost.closest('.si-map-container') as HTMLElement | null) ?? canvasHost.parentElement;
}

export function SiMapDynamicLegendStack({ mapRef, mapLoaded, entries }: SiMapDynamicLegendStackProps) {
  const [shell, setShell] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!mapLoaded) {
      setShell(null);
      return;
    }
    const map = resolveMapFromRef(mapRef);
    setShell(resolveMapShell(map));
  }, [mapLoaded, mapRef]);

  if (!mapLoaded || !shell || !entries.length) return null;

  return (
    <>
      {entries.map((entry, stackIndex) => {
        if (entry.kind === 'wms') {
          if (entry.displayMode === 'scientific') {
            return (
              <SiWmsIndexClassificationLegend
                key={entry.layerKey}
                layerId={entry.layerId}
                profile={entry.profile}
                layerLabel={entry.label}
                context={entry.context}
                symbologyPartial={entry.symbologyPartial}
                classifiedStopsOverride={entry.classifiedStops}
                classAnalytics={entry.classAnalytics}
                dataDrivenLabels={entry.dataDrivenLabels}
                stackIndex={stackIndex}
                offsetStorageKey={`si-map-layer-legend-offset-v1:${entry.layerKey}`}
              />
            );
          }
          return (
            <SiWmsLiveLayerLegend
              key={entry.layerKey}
              profile={entry.profile}
              layerId={entry.layerId}
              layerLabel={entry.label}
              context={entry.context}
              symbologyUi={mergeSymbologyUi(entry.symbologyPartial)}
              symbologyPartial={entry.symbologyPartial}
              classifiedStopsOverride={entry.classifiedStops}
              classAnalytics={entry.classAnalytics}
              dataDrivenLabels={entry.dataDrivenLabels}
              stackIndex={stackIndex}
              offsetStorageKey={`si-map-layer-legend-offset-v1:${entry.layerKey}`}
            />
          );
        }
        if (entry.kind === 'vector') {
          return (
            <SiMapVectorLayerLegend
              key={entry.layerKey}
              layerKey={entry.layerKey}
              layerLabel={entry.label}
              rows={entry.rows}
              stackIndex={stackIndex}
              mapShell={shell}
              badge="LAYER"
            />
          );
        }
        return (
          <SiMapVectorLayerLegend
            key={entry.layerKey}
            layerKey={entry.layerKey}
            layerLabel={entry.label}
            rows={entry.rows}
            stackIndex={stackIndex}
            mapShell={shell}
            badge="ALERTS"
          />
        );
      })}
    </>
  );
}
