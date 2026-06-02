import { computeSiMapSunDirection, formatDaylightMinutesLabel, type SiMapSunDirection } from './siMapDaylight';

const EARTH_R_M = 6_371_000;
/** Standard atmospheric refraction at horizon (degrees). */
const HORIZON_REFRACTION_DEG = 0.833;

export type SiMapSolarEventKind =
  | 'sunrise'
  | 'solarNoon'
  | 'sunset'
  | 'goldenHourMorningStart'
  | 'goldenHourMorningEnd'
  | 'goldenHourEveningStart'
  | 'goldenHourEveningEnd'
  | 'blueHourMorningStart'
  | 'blueHourMorningEnd'
  | 'blueHourEveningStart'
  | 'blueHourEveningEnd';

export type SiMapSolarEvent = {
  kind: SiMapSolarEventKind;
  label: string;
  minutes: number | null;
  timeLabel: string;
};

export type SiMapSunSkySnapshot = {
  atMinutes: number;
  isoDate: string;
  lat: number;
  lng: number;
  sun: SiMapSunDirection;
  azimuthLabel: string;
  elevationLabel: string;
  isDaylight: boolean;
  events: SiMapSolarEvent[];
  clearSkyGhiWm2: number;
  directNormalIrradianceWm2: number;
  diffuseHorizontalWm2: number;
  exposureScore: number;
  exposureLabel: string;
};

export type SiMapSolsticeComparison = {
  year: number;
  summerDate: string;
  winterDate: string;
  summer: SiMapSunDirection;
  winter: SiMapSunDirection;
  summerGhi: number;
  winterGhi: number;
};

export type SiMapRooftopSolarAssessment = {
  areaM2: number;
  panelDensityWm2: number;
  peakCapacityKw: number;
  annualYieldKwh: number;
  exposureScore: number;
  suitability: 'excellent' | 'good' | 'fair' | 'poor';
  notes: string[];
};

export type SiMapSunLineOfSightResult = {
  observer: { lng: number; lat: number };
  target: { lng: number; lat: number };
  distanceM: number;
  terrainClear: boolean;
  sunVisibleFromObserver: boolean;
  targetIlluminated: boolean;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  message: string;
};

function sunElevationDeg(minutes: number, isoDate: string, latDeg: number): number {
  return computeSiMapSunDirection(minutes, isoDate, latDeg).elevationDeg;
}

function findSunriseMinute(isoDate: string, latDeg: number): number | null {
  for (let m = 0; m <= 1439; m += 1) {
    if (sunElevationDeg(m, isoDate, latDeg) >= -HORIZON_REFRACTION_DEG) return m;
  }
  return null;
}

function findSunsetMinute(isoDate: string, latDeg: number): number | null {
  for (let m = 1439; m >= 0; m -= 1) {
    if (sunElevationDeg(m, isoDate, latDeg) >= -HORIZON_REFRACTION_DEG) return m;
  }
  return null;
}

/** Scan for minute when elevation crosses `targetElev` while rising or setting. */
function findElevationCrossingMinute(
  isoDate: string,
  latDeg: number,
  targetElev: number,
  mode: 'rise' | 'set',
): number | null {
  if (mode === 'rise') {
    for (let m = 0; m <= 1439; m += 1) {
      if (sunElevationDeg(m, isoDate, latDeg) >= targetElev) return m;
    }
    return null;
  }
  for (let m = 1439; m >= 0; m -= 1) {
    if (sunElevationDeg(m, isoDate, latDeg) >= targetElev) return m;
  }
  return null;
}

function findSolarNoonMinute(isoDate: string, latDeg: number): number {
  let bestMin = 720;
  let bestElev = -999;
  for (let m = 360; m <= 1080; m += 2) {
    const e = sunElevationDeg(m, isoDate, latDeg);
    if (e > bestElev) {
      bestElev = e;
      bestMin = m;
    }
  }
  return bestMin;
}

function findBandCrossing(
  isoDate: string,
  latDeg: number,
  elevDeg: number,
  startMin: number,
  endMin: number,
  mode: 'enter' | 'exit',
): number | null {
  const step = startMin <= endMin ? 1 : -1;
  let prev = sunElevationDeg(startMin, isoDate, latDeg);
  for (let m = startMin + step; step > 0 ? m <= endMin : m >= endMin; m += step) {
    const cur = sunElevationDeg(m, isoDate, latDeg);
    const prevIn = prev >= 0 && prev <= elevDeg;
    const curIn = cur >= 0 && cur <= elevDeg;
    if (mode === 'enter' && !prevIn && curIn) return m;
    if (mode === 'exit' && prevIn && !curIn) return m;
    const prevBlue = prev >= -6 && prev < 0;
    const curBlue = cur >= -6 && cur < 0;
    if (elevDeg < 0) {
      if (mode === 'enter' && !prevBlue && curBlue) return m;
      if (mode === 'exit' && prevBlue && !curBlue) return m;
    }
    prev = cur;
  }
  return null;
}

export function computeSiMapSolarEvents(isoDate: string, latDeg: number): SiMapSolarEvent[] {
  const sunrise = findSunriseMinute(isoDate, latDeg);
  const sunset = findSunsetMinute(isoDate, latDeg);
  const solarNoon = findSolarNoonMinute(isoDate, latDeg);

  const goldenMorningStart = sunrise;
  const goldenMorningEnd =
    sunrise != null ? findBandCrossing(isoDate, latDeg, 6, sunrise, solarNoon, 'exit') : null;
  const goldenEveningStart =
    sunset != null ? findBandCrossing(isoDate, latDeg, 6, solarNoon, sunset, 'enter') : null;
  const goldenEveningEnd = sunset;

  const blueMorningStart = findElevationCrossingMinute(isoDate, latDeg, -6, 'rise');
  const blueMorningEnd = sunrise;
  const blueEveningStart = sunset;
  const blueEveningEnd = findElevationCrossingMinute(isoDate, latDeg, -6, 'set');

  const mk = (kind: SiMapSolarEventKind, label: string, minutes: number | null): SiMapSolarEvent => ({
    kind,
    label,
    minutes,
    timeLabel: minutes != null ? formatDaylightMinutesLabel(minutes) : '—',
  });

  return [
    mk('sunrise', 'Sunrise', sunrise),
    mk('goldenHourMorningStart', 'Golden hour (morning start)', goldenMorningStart),
    mk('goldenHourMorningEnd', 'Golden hour (morning end)', goldenMorningEnd),
    mk('solarNoon', 'Solar noon', solarNoon),
    mk('goldenHourEveningStart', 'Golden hour (evening start)', goldenEveningStart),
    mk('goldenHourEveningEnd', 'Golden hour (evening end)', goldenEveningEnd),
    mk('sunset', 'Sunset', sunset),
    mk('blueHourMorningStart', 'Blue hour (morning start)', blueMorningStart),
    mk('blueHourMorningEnd', 'Blue hour (morning end)', blueMorningEnd),
    mk('blueHourEveningStart', 'Blue hour (evening start)', blueEveningStart),
    mk('blueHourEveningEnd', 'Blue hour (evening end)', blueEveningEnd),
  ];
}

export function formatSunAzimuthLabel(azimuthDeg: number): string {
  const a = ((azimuthDeg % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(a / 45) % 8;
  return `${a.toFixed(1)}° (${dirs[idx]})`;
}

export function formatSunElevationLabel(elevationDeg: number): string {
  if (elevationDeg <= -0.5) return `${elevationDeg.toFixed(1)}° (below horizon)`;
  if (elevationDeg < 6) return `${elevationDeg.toFixed(1)}° (low)`;
  if (elevationDeg < 45) return `${elevationDeg.toFixed(1)}° (moderate)`;
  return `${elevationDeg.toFixed(1)}° (high)`;
}

/** Simplified clear-sky irradiance model (W/m²) from sun elevation. */
export function estimateClearSkyIrradiance(elevationDeg: number): {
  ghi: number;
  dni: number;
  dhi: number;
} {
  if (elevationDeg <= 0) return { ghi: 0, dni: 0, dhi: 0 };
  const zenithRad = ((90 - elevationDeg) * Math.PI) / 180;
  const m = 1 / Math.max(0.15, Math.cos(zenithRad));
  const transmittance = Math.pow(0.7, m ** 0.678);
  const dni = 1361 * transmittance;
  const dhi = 0.3 * dni * (1 - Math.exp(-0.5 / Math.max(0.05, Math.sin((elevationDeg * Math.PI) / 180))));
  const ghi = dni * Math.sin((elevationDeg * Math.PI) / 180) + dhi;
  return {
    ghi: Math.max(0, Math.min(1200, ghi)),
    dni: Math.max(0, Math.min(1100, dni)),
    dhi: Math.max(0, Math.min(450, dhi)),
  };
}

/** 0–100 solar exposure score from elevation + day length proxy. */
export function computeSolarExposureScore(
  elevationDeg: number,
  isoDate: string,
  latDeg: number,
): { score: number; label: string } {
  const events = computeSiMapSolarEvents(isoDate, latDeg);
  const sunrise = events.find(e => e.kind === 'sunrise')?.minutes;
  const sunset = events.find(e => e.kind === 'sunset')?.minutes;
  const dayLengthH =
    sunrise != null && sunset != null ? Math.max(0, (sunset - sunrise) / 60) : 12;
  const elevFactor = Math.max(0, Math.min(1, elevationDeg / 75));
  const dayFactor = Math.min(1, dayLengthH / 14);
  const score = Math.round(100 * (0.55 * elevFactor + 0.45 * dayFactor));
  let label = 'Poor';
  if (score >= 75) label = 'Excellent';
  else if (score >= 55) label = 'Good';
  else if (score >= 35) label = 'Fair';
  return { score, label };
}

export function solsticeDatesForYear(year: number): { summer: string; winter: string } {
  return {
    summer: `${year}-06-21`,
    winter: `${year}-12-21`,
  };
}

export function computeSolsticeComparison(
  minutes: number,
  year: number,
  latDeg: number,
): SiMapSolsticeComparison {
  const { summer, winter } = solsticeDatesForYear(year);
  const summerSun = computeSiMapSunDirection(minutes, summer, latDeg);
  const winterSun = computeSiMapSunDirection(minutes, winter, latDeg);
  return {
    year,
    summerDate: summer,
    winterDate: winter,
    summer: summerSun,
    winter: winterSun,
    summerGhi: estimateClearSkyIrradiance(summerSun.elevationDeg).ghi,
    winterGhi: estimateClearSkyIrradiance(winterSun.elevationDeg).ghi,
  };
}

export function buildSiMapSunSkySnapshot(
  minutes: number,
  isoDate: string,
  latDeg: number,
  lngDeg: number,
): SiMapSunSkySnapshot {
  const sun = computeSiMapSunDirection(minutes, isoDate, latDeg);
  const irr = estimateClearSkyIrradiance(sun.elevationDeg);
  const exposure = computeSolarExposureScore(sun.elevationDeg, isoDate, latDeg);
  return {
    atMinutes: minutes,
    isoDate,
    lat: latDeg,
    lng: lngDeg,
    sun,
    azimuthLabel: formatSunAzimuthLabel(sun.azimuth),
    elevationLabel: formatSunElevationLabel(sun.elevationDeg),
    isDaylight: sun.elevationDeg > -HORIZON_REFRACTION_DEG,
    events: computeSiMapSolarEvents(isoDate, latDeg),
    clearSkyGhiWm2: irr.ghi,
    directNormalIrradianceWm2: irr.dni,
    diffuseHorizontalWm2: irr.dhi,
    exposureScore: exposure.score,
    exposureLabel: exposure.label,
  };
}

export function assessRooftopSolarPotential(
  snapshot: SiMapSunSkySnapshot,
  areaM2: number,
  panelDensityWm2: number,
): SiMapRooftopSolarAssessment {
  const peakKw = (areaM2 * panelDensityWm2) / 1000;
  const year = Number(snapshot.isoDate.slice(0, 4));
  const { summer, winter } = solsticeDatesForYear(Number.isFinite(year) ? year : new Date().getUTCFullYear());
  const noonSummer = buildSiMapSunSkySnapshot(720, summer, snapshot.lat, snapshot.lng);
  const noonWinter = buildSiMapSunSkySnapshot(720, winter, snapshot.lat, snapshot.lng);
  const avgGhi = (noonSummer.clearSkyGhiWm2 + noonWinter.clearSkyGhiWm2) / 2;
  const performanceRatio = 0.75 * (snapshot.exposureScore / 100);
  const annualYieldKwh = Math.round(peakKw * (avgGhi / 1000) * 365 * 4.5 * performanceRatio);
  let suitability: SiMapRooftopSolarAssessment['suitability'] = 'poor';
  if (snapshot.exposureScore >= 70 && snapshot.sun.elevationDeg >= 25) suitability = 'excellent';
  else if (snapshot.exposureScore >= 50) suitability = 'good';
  else if (snapshot.exposureScore >= 30) suitability = 'fair';
  const notes: string[] = [];
  if (snapshot.sun.elevationDeg < 15) notes.push('Low sun angle — consider roof tilt optimization.');
  if (snapshot.exposureScore < 40) notes.push('Limited exposure — nearby obstructions or high latitude.');
  if (peakKw >= 10) notes.push('Suitable for commercial-scale array.');
  return {
    areaM2,
    panelDensityWm2,
    peakCapacityKw: Math.round(peakKw * 10) / 10,
    annualYieldKwh,
    exposureScore: snapshot.exposureScore,
    suitability,
    notes,
  };
}

export function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_R_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ground point along azimuth from origin (flat-earth approximation for visualization). */
export function sunGroundPositionFromAzimuth(
  originLng: number,
  originLat: number,
  azimuthDeg: number,
  distanceKm: number,
): { lng: number; lat: number } {
  const distM = distanceKm * 1000;
  const brng = (azimuthDeg * Math.PI) / 180;
  const lat1 = (originLat * Math.PI) / 180;
  const lng1 = (originLng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distM / EARTH_R_M) +
      Math.cos(lat1) * Math.sin(distM / EARTH_R_M) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distM / EARTH_R_M) * Math.cos(lat1),
      Math.cos(distM / EARTH_R_M) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lng: (lng2 * 180) / Math.PI, lat: (lat2 * 180) / Math.PI };
}

/** Sample solar path polyline for map overlay (every 30 min). */
export function buildSolarPathCoords(
  isoDate: string,
  latDeg: number,
  originLng: number,
  originLat: number,
  distanceKm = 25,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let m = 0; m <= 1440; m += 30) {
    const sun = computeSiMapSunDirection(m, isoDate, latDeg);
    if (sun.elevationDeg <= 0) continue;
    const pt = sunGroundPositionFromAzimuth(originLng, originLat, sun.azimuth, distanceKm);
    coords.push([pt.lng, pt.lat]);
  }
  return coords;
}

export type SiMapLosTerrainSample = { lng: number; lat: number; elevM: number };

/**
 * Line-of-sight with sun context — uses terrain samples when provided, otherwise geometric horizon check.
 */
export function analyzeSunLineOfSight(
  observer: { lng: number; lat: number; elevM?: number },
  target: { lng: number; lat: number; elevM?: number },
  sun: SiMapSunDirection,
  terrainSamples?: SiMapLosTerrainSample[],
): SiMapSunLineOfSightResult {
  const distanceM = haversineM(observer.lng, observer.lat, target.lng, target.lat);
  const obsH = observer.elevM ?? 0;
  const tgtH = target.elevM ?? 0;

  let terrainClear = true;
  if (terrainSamples && terrainSamples.length >= 2) {
    for (let i = 1; i < terrainSamples.length - 1; i += 1) {
      const t = i / (terrainSamples.length - 1);
      const required = obsH + t * (tgtH - obsH);
      if (terrainSamples[i]!.elevM > required + 2) {
        terrainClear = false;
        break;
      }
    }
  }

  const sunVisibleFromObserver = sun.elevationDeg > 0;
  const targetIlluminated = terrainClear && sunVisibleFromObserver && sun.elevationDeg >= 5;

  let message = terrainClear
    ? 'Target is visible along the terrain profile.'
    : 'Terrain blocks the line of sight to the target.';
  if (!sunVisibleFromObserver) message += ' Sun is below the horizon.';
  else if (!terrainClear) message += ' Shadowing may occur even when the sun is up.';
  else if (sun.elevationDeg < 5) message += ' Very low sun — long shadows expected.';

  return {
    observer: { lng: observer.lng, lat: observer.lat },
    target: { lng: target.lng, lat: target.lat },
    distanceM,
    terrainClear,
    sunVisibleFromObserver,
    targetIlluminated,
    sunAzimuthDeg: sun.azimuth,
    sunElevationDeg: sun.elevationDeg,
    message,
  };
}

export function yearFromIsoDate(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getUTCFullYear();
}
