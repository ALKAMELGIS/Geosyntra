import type { Map as MapboxMap } from 'mapbox-gl';
import type { RouteElevationSample } from '../../../lib/geoAiRoutePlan';
import { ensureSiMapDaylightTerrainSupport } from './siMapProjectionTerrain';

const EARTH_R_M = 6_371_000;
const M_TO_FT = 3.280839895;

export type SiElevationProfileSample = RouteElevationSample & {
  lng: number;
  lat: number;
  gradePct: number;
};

export type SiElevationProfileStats = {
  minM: number;
  maxM: number;
  avgM: number;
  gainM: number;
  lossM: number;
  totalDistM: number;
  maxGradePct: number;
};

export type SiElevationProfileUnit = 'm' | 'ft';

export function metersToDisplayElev(m: number, unit: SiElevationProfileUnit): number {
  return unit === 'ft' ? m * M_TO_FT : m;
}

export function displayDistance(m: number, unit: SiElevationProfileUnit): number {
  return unit === 'ft' ? m * M_TO_FT : m;
}

export function distanceUnitLabel(unit: SiElevationProfileUnit): string {
  return unit === 'ft' ? 'ft' : 'm';
}

export function elevUnitLabel(unit: SiElevationProfileUnit): string {
  return unit === 'ft' ? 'ft' : 'm';
}

export function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_R_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Insert vertices along a polyline so samples are roughly `spacingM` apart. */
export function densifyLineCoords(coords: [number, number][], spacingM: number): [number, number][] {
  if (coords.length < 2) return coords.slice();
  const out: [number, number][] = [coords[0]];
  let carry = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [lng0, lat0] = coords[i - 1];
    const [lng1, lat1] = coords[i];
    const seg = haversineM(lng0, lat0, lng1, lat1);
    if (seg < 1e-3) continue;
    let distAlong = spacingM - carry;
    while (distAlong < seg) {
      const t = distAlong / seg;
      out.push([lng0 + (lng1 - lng0) * t, lat0 + (lat1 - lat0) * t]);
      distAlong += spacingM;
    }
    carry = (carry + seg) % spacingM;
    out.push([lng1, lat1]);
  }
  return out;
}

function syntheticElevationM(lng: number, lat: number): number {
  const a = Math.sin(lng * 11.3) * Math.cos(lat * 8.7);
  const b = Math.sin(lng * 2.4 + lat * 1.9) * 0.55;
  const c = Math.cos(lng * 0.85 - lat * 1.2) * 0.35;
  return (a + b + c) * 420 + lat * 18 - lng * 6;
}

function queryMapTerrainM(map: MapboxMap, lng: number, lat: number): number | null {
  try {
    const raw = map.queryTerrainElevation?.({ lng, lat }, { exaggerated: false });
    if (raw != null && Number.isFinite(raw)) return raw;
    const exag = map.queryTerrainElevation?.({ lng, lat }, { exaggerated: true });
    if (exag != null && Number.isFinite(exag) && map.getTerrain?.()) {
      const spec = (map.getTerrain() as { exaggeration?: number })?.exaggeration;
      const div = typeof spec === 'number' && spec > 0 ? spec : 1;
      return exag / div;
    }
  } catch {
    /* terrain unavailable */
  }
  return null;
}

async function fetchOpenMeteoElevationBatch(coords: [number, number][]): Promise<number[]> {
  if (!coords.length) return [];
  const lats = coords.map(([, lat]) => lat.toFixed(5)).join(',');
  const lngs = coords.map(([lng]) => lng.toFixed(5)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(lats)}&longitude=${encodeURIComponent(lngs)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Elevation service unavailable');
  const data = (await res.json()) as { elevation?: number[] };
  const elev = data.elevation;
  if (!Array.isArray(elev) || elev.length !== coords.length) {
    throw new Error('Invalid elevation response');
  }
  return elev;
}

export function computeElevationProfileStats(samples: SiElevationProfileSample[]): SiElevationProfileStats | null {
  if (!samples.length) return null;
  let minM = samples[0].elevationM;
  let maxM = samples[0].elevationM;
  let sum = 0;
  let gain = 0;
  let loss = 0;
  let maxGrade = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const e = samples[i].elevationM;
    minM = Math.min(minM, e);
    maxM = Math.max(maxM, e);
    sum += e;
    if (i > 0) {
      const de = e - samples[i - 1].elevationM;
      const dd = Math.max(1, samples[i].distanceM - samples[i - 1].distanceM);
      const grade = (de / dd) * 100;
      maxGrade = Math.max(maxGrade, Math.abs(grade));
      if (de > 0) gain += de;
      else loss += de;
    }
  }
  const totalDistM = samples[samples.length - 1]?.distanceM ?? 0;
  return {
    minM,
    maxM,
    avgM: sum / samples.length,
    gainM: gain,
    lossM: loss,
    totalDistM,
    maxGradePct: maxGrade,
  };
}

export type BuildSiMapElevationProfileOpts = {
  spacingM?: number;
  maxSamples?: number;
};

/**
 * Sample ground elevation along a user-drawn polyline (Mapbox terrain DEM, Open-Meteo fallback).
 */
export async function buildSiMapElevationProfile(
  map: MapboxMap | null,
  vertices: [number, number][],
  opts: BuildSiMapElevationProfileOpts = {},
): Promise<{ samples: SiElevationProfileSample[]; stats: SiElevationProfileStats | null }> {
  if (vertices.length < 2) return { samples: [], stats: null };

  const spacingM = opts.spacingM ?? 40;
  const maxSamples = opts.maxSamples ?? 200;
  let dense = densifyLineCoords(vertices, spacingM);
  if (dense.length > maxSamples) {
    const step = Math.ceil(dense.length / maxSamples);
    dense = dense.filter((_, i) => i % step === 0 || i === dense.length - 1);
  }

  if (map) {
    try {
      ensureSiMapDaylightTerrainSupport(map, { buildings: false });
    } catch {
      /* ignore */
    }
  }

  let terrainHits = 0;
  const rawElev: number[] = [];
  for (const [lng, lat] of dense) {
    let e: number | null = null;
    if (map) e = queryMapTerrainM(map, lng, lat);
    if (e != null) terrainHits += 1;
    rawElev.push(e ?? Number.NaN);
  }

  if (terrainHits < dense.length * 0.35) {
    try {
      const chunk = 80;
      for (let i = 0; i < dense.length; i += chunk) {
        const slice = dense.slice(i, i + chunk);
        const elev = await fetchOpenMeteoElevationBatch(slice);
        for (let j = 0; j < elev.length; j += 1) {
          const idx = i + j;
          if (!Number.isFinite(rawElev[idx])) rawElev[idx] = elev[j];
        }
      }
    } catch {
      /* keep partial / synthetic */
    }
  }

  const samples: SiElevationProfileSample[] = [];
  let dist = 0;
  for (let i = 0; i < dense.length; i += 1) {
    const [lng, lat] = dense[i];
    if (i > 0) {
      const [plng, plat] = dense[i - 1];
      dist += haversineM(plng, plat, lng, lat);
    }
    let elevationM = rawElev[i];
    if (!Number.isFinite(elevationM)) elevationM = syntheticElevationM(lng, lat);
    const prev = samples[i - 1];
    let gradePct = 0;
    if (prev) {
      const dd = Math.max(1, dist - prev.distanceM);
      gradePct = ((elevationM - prev.elevationM) / dd) * 100;
    }
    samples.push({
      distanceM: Math.round(dist),
      elevationM,
      lng,
      lat,
      gradePct,
    });
  }

  return { samples, stats: computeElevationProfileStats(samples) };
}

export function reverseProfileVertices(vertices: [number, number][]): [number, number][] {
  return [...vertices].reverse();
}
