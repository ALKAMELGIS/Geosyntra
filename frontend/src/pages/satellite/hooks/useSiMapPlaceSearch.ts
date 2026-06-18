import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMapboxGeocodingFeatures } from '../../../lib/mapboxGeocodeClient';
import { isMapboxGlInitPlaceholder, isMapboxSessionConfigured } from '../../../lib/mapboxAccessToken';
import {
  allowsGeocodeWhenNoStrongLayerHit,
  isGisDataScopedQuestion,
} from '../../../lib/geoExplorerLayerContext';
import { satelliteCustomLayersToGeoAiLayers } from '../../../lib/geoAiMapLayerSources';
import {
  findMatchingLayerFeatures,
  findMatchingMapLayers,
  mapGeocodeFeaturesToPlaceHits,
  mergeMapSearchHits,
  parseLatLngQuery,
  type SiMapSearchCustomLayerLite,
  type SiMapSearchHit,
  type SiMapSearchWmsLayerLite,
} from '../siMapSearch';

export type UseSiMapPlaceSearchOpts = {
  customLayers: SiMapSearchCustomLayerLite[];
  wmsLayers: SiMapSearchWmsLayerLite[];
  mapboxToken: string;
};

async function fetchPlaceFeatures(
  q: string,
  mapboxToken: string,
): Promise<unknown[]> {
  const coord = parseLatLngQuery(q);
  if (coord) {
    return [
      {
        id: `coord:${coord.lat},${coord.lng}`,
        text: `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`,
        place_name: `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`,
        center: [coord.lng, coord.lat],
        geometry: { type: 'Point', coordinates: [coord.lng, coord.lat] },
      },
    ];
  }

  if (isMapboxSessionConfigured()) {
    return fetchMapboxGeocodingFeatures(q, 8);
  }
  if (mapboxToken && !isMapboxGlInitPlaceholder(mapboxToken)) {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxToken}&limit=8`,
    );
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data?.features) ? data.features : [];
    }
    return [];
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=geojson&limit=8&q=${encodeURIComponent(q)}`,
    { headers: { 'Accept-Language': 'en' } },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data?.features) ? data.features : Array.isArray(data) ? data : [];
}

function shouldSkipExternalGeocode(
  q: string,
  featureHitCount: number,
  customLayers: SiMapSearchCustomLayerLite[],
): boolean {
  if (featureHitCount > 0) return true;
  const geoAiLayers = satelliteCustomLayersToGeoAiLayers(customLayers);
  if (!geoAiLayers.length) return false;
  if (isGisDataScopedQuestion(q, geoAiLayers) && !allowsGeocodeWhenNoStrongLayerHit(q, geoAiLayers)) {
    return true;
  }
  return false;
}

function localSearchHits(
  customLayers: SiMapSearchCustomLayerLite[],
  wmsLayers: SiMapSearchWmsLayerLite[],
  q: string,
) {
  const featureHits = findMatchingLayerFeatures(customLayers, q);
  const layerHits = findMatchingMapLayers(customLayers, wmsLayers, q);
  return { featureHits, layerHits, merged: mergeMapSearchHits(featureHits, layerHits, []) };
}

export function useSiMapPlaceSearch({
  customLayers,
  wmsLayers,
  mapboxToken,
}: UseSiMapPlaceSearchOpts) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SiMapSearchHit[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (searchTerm?: string): Promise<SiMapSearchHit | null> => {
      const q = (searchTerm ?? query).trim();
      if (!q) return null;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const { featureHits, layerHits, merged: localMerged } = localSearchHits(customLayers, wmsLayers, q);
      setResults(localMerged);
      setShowResults(localMerged.length > 0);
      let best: SiMapSearchHit | null = localMerged[0] ?? null;

      if (shouldSkipExternalGeocode(q, featureHits.length, customLayers)) {
        setIsSearching(false);
        return best;
      }

      setIsSearching(true);
      try {
        const features = await fetchPlaceFeatures(q, mapboxToken);
        if (ac.signal.aborted) return best;
        if (features.length) {
          const placeHits = mapGeocodeFeaturesToPlaceHits(features);
          const merged = mergeMapSearchHits(featureHits, layerHits, placeHits);
          setResults(merged);
          setShowResults(merged.length > 0);
          best = merged[0] ?? best;
        }
      } catch (error) {
        if (!ac.signal.aborted) console.error('Search failed', error);
      } finally {
        if (!ac.signal.aborted) setIsSearching(false);
      }
      return best;
    },
    [query, customLayers, wmsLayers, mapboxToken],
  );

  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const { featureHits, layerHits, merged: localMerged } = localSearchHits(customLayers, wmsLayers, q);
    const timer = window.setTimeout(() => {
      void (async () => {
        if (q.length < 2 && !parseLatLngQuery(q)) {
          setResults(localMerged);
          setShowResults(localMerged.length > 0);
          return;
        }
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setResults(localMerged);
        setShowResults(localMerged.length > 0);

        if (shouldSkipExternalGeocode(q, featureHits.length, customLayers)) {
          setIsSearching(false);
          return;
        }

        setIsSearching(true);
        try {
          const features = await fetchPlaceFeatures(q, mapboxToken);
          if (ac.signal.aborted) return;
          const placeHits = features.length ? mapGeocodeFeaturesToPlaceHits(features) : [];
          const merged = mergeMapSearchHits(featureHits, layerHits, placeHits);
          setResults(merged);
          setShowResults(merged.length > 0);
        } catch {
          if (!ac.signal.aborted) {
            setResults(localMerged);
            setShowResults(localMerged.length > 0);
          }
        } finally {
          if (!ac.signal.aborted) setIsSearching(false);
        }
      })();
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query, isOpen, customLayers, wmsLayers, mapboxToken]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    query,
    setQuery,
    results,
    showResults,
    setShowResults,
    isOpen,
    setIsOpen,
    isSearching,
    runSearch,
  };
}
