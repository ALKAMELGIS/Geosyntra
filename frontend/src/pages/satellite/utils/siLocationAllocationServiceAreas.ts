import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { RouteMapProfile } from '../../../lib/graphHopperRouting';
import { resolveOrsApiKey } from '../../../lib/openRouteServiceRouting';
import { resolveApiUrl } from '../../../lib/apiClient';
import { readAccessToken } from '../../../lib/auth';
import { mustUseApiGateway } from '../../../lib/platformTokenRuntime';
import type { LaPoint } from './siLocationAllocationTypes';

const ORS_API = 'https://api.openrouteservice.org';

export type LaServiceAreaMeasure = 'time' | 'distance';
export type LaServiceAreaTravelMode = 'car' | 'foot' | 'bike';

export type LaServiceAreaSymbology = {
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
};

export type LaServiceAreaSettings = {
  enabled: boolean;
  measure: LaServiceAreaMeasure;
  timePresets: Record<'5' | '10' | '15' | '30', boolean>;
  distancePresets: Record<'1' | '3' | '5' | '10', boolean>;
  useCustomTime: boolean;
  customTimeMinutes: number;
  useCustomDistance: boolean;
  customDistanceKm: number;
  travelMode: LaServiceAreaTravelMode;
  symbology: LaServiceAreaSymbology;
};

export type LaServiceAreaRingStat = {
  ringId: string;
  facilityId: string;
  facilityLabel: string;
  ringLabel: string;
  servedCount: number;
  totalDemand: number;
  coveragePercent: number;
};

export type LaServiceAreaBuildResult = {
  geojson: FeatureCollection;
  ringStats: LaServiceAreaRingStat[];
  servedDemandIds: string[];
};

export const DEFAULT_LA_SERVICE_AREA_SYMBOLOGY: LaServiceAreaSymbology = {
  fillColor: '#3B82F6',
  fillOpacity: 0.14,
  borderColor: '#60A5FA',
  borderWidth: 1.5,
};

export const DEFAULT_LA_SERVICE_AREA_SETTINGS: LaServiceAreaSettings = {
  enabled: false,
  measure: 'time',
  timePresets: { '5': false, '10': false, '15': true, '30': false },
  distancePresets: { '1': false, '3': false, '5': true, '10': false },
  useCustomTime: false,
  customTimeMinutes: 20,
  useCustomDistance: false,
  customDistanceKm: 2,
  travelMode: 'car',
  symbology: { ...DEFAULT_LA_SERVICE_AREA_SYMBOLOGY },
};

export function laServiceAreaTravelModeToProfile(mode: LaServiceAreaTravelMode): RouteMapProfile {
  if (mode === 'foot') return 'foot';
  if (mode === 'bike') return 'bike';
  return 'car';
}

export function activeLaServiceAreaRings(settings: LaServiceAreaSettings): number[] {
  if (settings.measure === 'time') {
    const rings: number[] = [];
    (['5', '10', '15', '30'] as const).forEach(k => {
      if (settings.timePresets[k]) rings.push(Number(k));
    });
    if (settings.useCustomTime && settings.customTimeMinutes > 0) {
      rings.push(settings.customTimeMinutes);
    }
    return [...new Set(rings)].sort((a, b) => a - b);
  }
  const rings: number[] = [];
  (['1', '3', '5', '10'] as const).forEach(k => {
    if (settings.distancePresets[k]) rings.push(Number(k));
  });
  if (settings.useCustomDistance && settings.customDistanceKm > 0) {
    rings.push(settings.customDistanceKm);
  }
  return [...new Set(rings)].sort((a, b) => a - b);
}

function orsProfile(mode: LaServiceAreaTravelMode): string {
  if (mode === 'foot') return 'foot-walking';
  if (mode === 'bike') return 'cycling-regular';
  return 'driving-car';
}

function profileSpeedMps(mode: LaServiceAreaTravelMode): number {
  if (mode === 'foot') return 1.4;
  if (mode === 'bike') return 4.5;
  return 11.1;
}

async function orsPost<T>(path: string, body: Record<string, unknown>, apiKey: string): Promise<T> {
  const useGateway = mustUseApiGateway() || apiKey === '__gateway__';
  const res = await fetch(
    useGateway ? resolveApiUrl(`/api/gateway/openrouteservice${path}`) : `${ORS_API}${path}`,
    {
      method: 'POST',
      headers: useGateway
        ? {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(readAccessToken() ? { Authorization: `Bearer ${readAccessToken()}` } : {}),
          }
        : {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: apiKey,
          },
      credentials: useGateway ? 'include' : 'omit',
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ||
      (data as { message?: string })?.message ||
      `OpenRouteService HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function circleRingMeters(lng: number, lat: number, radiusM: number, steps = 48): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    coords.push([
      lng + (radiusM / mPerDegLng) * Math.cos(t),
      lat + (radiusM / mPerDegLat) * Math.sin(t),
    ]);
  }
  return coords;
}

function haversineMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function ringMetersForValue(settings: LaServiceAreaSettings, value: number): number {
  if (settings.measure === 'distance') return value * 1000;
  return value * 60 * profileSpeedMps(settings.travelMode);
}

function ringLabel(settings: LaServiceAreaSettings, value: number): string {
  return settings.measure === 'time' ? `${value} min` : `${value} km`;
}

function polygonOuterRing(f: Feature): [number, number][] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Polygon') return g.coordinates[0] as [number, number][];
  if (g.type === 'MultiPolygon' && g.coordinates[0]?.[0]) {
    return g.coordinates[0][0] as [number, number][];
  }
  return null;
}

function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function demandInsideFeature(d: LaPoint, f: Feature, facility: LaPoint, radiusM: number): boolean {
  const ring = polygonOuterRing(f);
  if (ring && ring.length >= 4) return pointInRing(d.lng, d.lat, ring);
  return haversineMeters(d, facility) <= radiusM;
}

async function fetchOrsRingsForFacility(
  facility: LaPoint,
  settings: LaServiceAreaSettings,
  rings: number[],
  apiKey: string,
): Promise<Feature[]> {
  if (!rings.length) return [];

  const range =
    settings.measure === 'time'
      ? rings.map(m => m * 60)
      : rings.map(km => km * 1000);

  try {
    const data = await orsPost<FeatureCollection>(
      `/v2/isochrones/${orsProfile(settings.travelMode)}`,
      {
        locations: [[facility.lng, facility.lat]],
        range,
        range_type: settings.measure === 'time' ? 'time' : 'distance',
      },
      apiKey,
    );
    return (data.features ?? []).map((f, i) => ({
      ...f,
      properties: {
        ...(typeof f.properties === 'object' && f.properties ? f.properties : {}),
        role: 'la-service-area',
        facilityId: facility.id,
        facilityLabel: facility.label ?? facility.id,
        ringIndex: i,
        ringValue: rings[Math.min(i, rings.length - 1)],
        ringLabel: ringLabel(settings, rings[Math.min(i, rings.length - 1)]),
        ringMeters: ringMetersForValue(settings, rings[Math.min(i, rings.length - 1)]),
      },
    }));
  } catch {
    return [];
  }
}

function buildCircleFeatures(facility: LaPoint, settings: LaServiceAreaSettings, rings: number[]): Feature[] {
  return rings.map((value, i) => {
    const radiusM = ringMetersForValue(settings, value);
    return {
      type: 'Feature',
      properties: {
        role: 'la-service-area',
        facilityId: facility.id,
        facilityLabel: facility.label ?? facility.id,
        ringIndex: i,
        ringValue: value,
        ringLabel: ringLabel(settings, value),
        ringMeters: radiusM,
        geometrySource: 'circle',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [circleRingMeters(facility.lng, facility.lat, radiusM)],
      } as Polygon,
    };
  });
}

export async function buildLaServiceAreas(args: {
  facilities: LaPoint[];
  demandPoints: LaPoint[];
  settings: LaServiceAreaSettings;
  apiKey?: string;
}): Promise<LaServiceAreaBuildResult> {
  const { facilities, demandPoints, settings } = args;
  const empty: LaServiceAreaBuildResult = {
    geojson: { type: 'FeatureCollection', features: [] },
    ringStats: [],
    servedDemandIds: [],
  };

  if (!settings.enabled || !facilities.length) return empty;

  const rings = activeLaServiceAreaRings(settings);
  if (!rings.length) return empty;

  const apiKey = args.apiKey?.trim() || resolveOrsApiKey();
  const allFeatures: Feature[] = [];

  for (const facility of facilities) {
    let features: Feature[] = [];
    if (apiKey) {
      features = await fetchOrsRingsForFacility(facility, settings, rings, apiKey);
    }
    if (!features.length) {
      features = buildCircleFeatures(facility, settings, rings);
    }
    allFeatures.push(...features);
  }

  const ringStats: LaServiceAreaRingStat[] = [];
  const servedSet = new Set<string>();
  const totalDemand = demandPoints.length;

  for (const f of allFeatures) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const facilityId = String(p.facilityId ?? '');
    const facility = facilities.find(x => x.id === facilityId);
    if (!facility) continue;
    const ringId = `${facilityId}-${String(p.ringIndex ?? 0)}`;
    const radiusM = Number(p.ringMeters ?? ringMetersForValue(settings, Number(p.ringValue ?? 0)));
    let servedCount = 0;
    for (const d of demandPoints) {
      if (demandInsideFeature(d, f, facility, radiusM)) {
        servedCount += 1;
        servedSet.add(d.id);
      }
    }
    ringStats.push({
      ringId,
      facilityId,
      facilityLabel: String(p.facilityLabel ?? facilityId),
      ringLabel: String(p.ringLabel ?? ''),
      servedCount,
      totalDemand,
      coveragePercent: totalDemand ? (servedCount / totalDemand) * 100 : 0,
    });
  }

  return {
    geojson: { type: 'FeatureCollection', features: allFeatures },
    ringStats,
    servedDemandIds: [...servedSet],
  };
}
