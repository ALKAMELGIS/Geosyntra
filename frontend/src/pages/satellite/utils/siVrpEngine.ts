import type { FeatureCollection } from 'geojson';
import {
  formatRouteDistance,
  formatRouteDuration,
  type GeoAiRouteEndpoint,
} from '../../../lib/geoAiRoutePlan';
import {
  orsDirectionsSession,
  orsMatrixMetrics,
  type RouteMapProfile,
} from '../../../lib/openRouteServiceRouting';
import {
  DEFAULT_VRP_SETTINGS,
  VRP_VEHICLE_COLORS,
  type VrpAnalysisReport,
  type VrpLocation,
  type VrpRouteStop,
  type VrpSettings,
  type VrpSolveResult,
  type VrpVehicleRoute,
} from './siVrpTypes';

export type VrpCostMatrix = {
  durations: number[][];
  distances: number[][];
};

function costAt(
  matrix: VrpCostMatrix,
  goal: VrpSettings['optimizeGoal'],
  from: number,
  to: number,
): number {
  const grid = goal === 'minimize-distance' ? matrix.distances : matrix.durations;
  return grid[from]?.[to] ?? Number.POSITIVE_INFINITY;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Greedy nearest-neighbor VRP with capacity, time, and max-stops constraints. */
export function solveVrpGreedy(args: {
  depot: VrpLocation;
  stops: VrpLocation[];
  settings: VrpSettings;
  matrix: VrpCostMatrix;
}): { routes: VrpVehicleRoute[]; unassignedStopIds: string[] } {
  const { depot, stops, settings, matrix } = args;
  const vehicleCount = clampInt(settings.vehicleCount, 1, 8);
  const maxStops = clampInt(settings.maxStopsPerVehicle, 1, 50);
  const capacity = settings.capacityPerVehicle != null ? Math.max(1, settings.capacityPerVehicle) : null;
  const maxRouteSeconds =
    settings.maxRouteTimeMinutes != null && settings.maxRouteTimeMinutes > 0
      ? settings.maxRouteTimeMinutes * 60
      : null;

  const depotIdx = 0;
  const stopIndexById = new Map(stops.map((s, i) => [s.id, i + 1]));
  const unassigned = new Set(stops.map(s => s.id));
  const routes: VrpVehicleRoute[] = [];

  for (let v = 0; v < vehicleCount && unassigned.size > 0; v++) {
    const routeStops: VrpRouteStop[] = [];
    let currentIdx = depotIdx;
    let load = 0;
    let routeTime = 0;
    let routeDistance = 0;

    while (routeStops.length < maxStops && unassigned.size > 0) {
      let bestStop: VrpLocation | null = null;
      let bestCost = Number.POSITIVE_INFINITY;
      let bestIdx = -1;

      for (const stopId of unassigned) {
        const stop = stops.find(s => s.id === stopId);
        if (!stop) continue;
        const stopIdx = stopIndexById.get(stopId)!;
        const demand = stop.demand ?? 1;
        if (capacity != null && load + demand > capacity) continue;

        const legCost = costAt(matrix, settings.optimizeGoal, currentIdx, stopIdx);
        if (!Number.isFinite(legCost)) continue;

        let totalTime = routeTime + legCost;
        if (settings.routePattern === 'round-trip') {
          const returnLeg = costAt(matrix, settings.optimizeGoal, stopIdx, depotIdx);
          if (Number.isFinite(returnLeg)) totalTime += returnLeg;
        }
        if (maxRouteSeconds != null && totalTime > maxRouteSeconds) continue;

        if (legCost < bestCost) {
          bestCost = legCost;
          bestStop = stop;
          bestIdx = stopIdx;
        }
      }

      if (!bestStop || bestIdx < 0) break;

      const legDist = matrix.distances[currentIdx]?.[bestIdx] ?? 0;
      const legDur = matrix.durations[currentIdx]?.[bestIdx] ?? 0;
      routeStops.push({
        locationId: bestStop.id,
        label: bestStop.label,
        sequence: routeStops.length + 1,
        lng: bestStop.lng,
        lat: bestStop.lat,
      });
      unassigned.delete(bestStop.id);
      load += bestStop.demand ?? 1;
      routeTime += legDur;
      routeDistance += legDist;
      currentIdx = bestIdx;
    }

    if (settings.routePattern === 'round-trip' && routeStops.length > 0) {
      routeTime += matrix.durations[currentIdx]?.[depotIdx] ?? 0;
      routeDistance += matrix.distances[currentIdx]?.[depotIdx] ?? 0;
    }

    const utilization =
      capacity != null
        ? (load / capacity) * 100
        : maxStops > 0
          ? (routeStops.length / maxStops) * 100
          : routeStops.length > 0
            ? 100
            : 0;

    routes.push({
      vehicleId: v + 1,
      vehicleLabel: `Vehicle ${v + 1}`,
      color: VRP_VEHICLE_COLORS[v % VRP_VEHICLE_COLORS.length],
      stops: routeStops,
      distanceMeters: Math.round(routeDistance),
      durationSeconds: Math.round(routeTime),
      stopCount: routeStops.length,
      utilizationPercent: Math.min(100, utilization),
    });
  }

  return { routes, unassignedStopIds: [...unassigned] };
}

export function buildVrpMapGeoJson(args: {
  depot: VrpLocation;
  routes: VrpVehicleRoute[];
  routeGeometries: FeatureCollection[];
}): FeatureCollection {
  const features: FeatureCollection['features'] = [
    {
      type: 'Feature',
      properties: { role: 'vrp-depot', label: args.depot.label },
      geometry: { type: 'Point', coordinates: [args.depot.lng, args.depot.lat] },
    },
  ];

  for (const route of args.routes) {
    for (const stop of route.stops) {
      features.push({
        type: 'Feature',
        properties: {
          role: 'vrp-stop',
          vehicleId: route.vehicleId,
          vehicleLabel: route.vehicleLabel,
          sequence: stop.sequence,
          label: stop.label,
          color: route.color,
        },
        geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
      });
    }
  }

  args.routeGeometries.forEach((fc, i) => {
    const route = args.routes[i];
    if (!route || !fc?.features?.length) return;
    for (const f of fc.features) {
      if (f.geometry?.type !== 'LineString') continue;
      features.push({
        ...f,
        properties: {
          ...(typeof f.properties === 'object' && f.properties ? f.properties : {}),
          role: 'vrp-route',
          vehicleId: route.vehicleId,
          vehicleLabel: route.vehicleLabel,
          color: route.color,
        },
      });
    }
  });

  return { type: 'FeatureCollection', features };
}

function buildReport(args: {
  routes: VrpVehicleRoute[];
  unassignedStopIds: string[];
  vehicleCount: number;
}): VrpAnalysisReport {
  const totalDistanceMeters = args.routes.reduce((s, r) => s + r.distanceMeters, 0);
  const totalDurationSeconds = args.routes.reduce((s, r) => s + r.durationSeconds, 0);
  const totalStops = args.routes.reduce((s, r) => s + r.stopCount, 0);
  const activeRoutes = args.routes.filter(r => r.stopCount > 0);
  const averageUtilizationPercent =
    activeRoutes.length > 0
      ? activeRoutes.reduce((s, r) => s + r.utilizationPercent, 0) / activeRoutes.length
      : 0;

  return {
    totalDistanceMeters,
    totalDurationSeconds,
    totalStops,
    vehicleCount: args.vehicleCount,
    averageUtilizationPercent,
    unassignedStopIds: args.unassignedStopIds,
    distanceLabel: formatRouteDistance(totalDistanceMeters),
    durationLabel: formatRouteDuration(totalDurationSeconds),
  };
}

export async function runVrpAnalysis(args: {
  depot: VrpLocation;
  stops: VrpLocation[];
  settings?: Partial<VrpSettings>;
  profile: RouteMapProfile;
  apiKey?: string;
}): Promise<VrpSolveResult | null> {
  const settings: VrpSettings = { ...DEFAULT_VRP_SETTINGS, ...args.settings };
  if (!args.stops.length) return null;

  const allLocations = [args.depot, ...args.stops];
  const metrics = await orsMatrixMetrics({
    locations: allLocations.map(l => ({ lng: l.lng, lat: l.lat })),
    profile: args.profile,
    apiKey: args.apiKey,
  });
  if (!metrics) return null;

  const { routes, unassignedStopIds } = solveVrpGreedy({
    depot: args.depot,
    stops: args.stops,
    settings,
    matrix: metrics,
  });

  const routeGeometries: FeatureCollection[] = [];
  for (const route of routes) {
    if (!route.stops.length) {
      routeGeometries.push({ type: 'FeatureCollection', features: [] });
      continue;
    }

    const origin: GeoAiRouteEndpoint = {
      label: args.depot.label,
      lng: args.depot.lng,
      lat: args.depot.lat,
    };
    const orderedStops: GeoAiRouteEndpoint[] = route.stops.map(s => ({
      label: s.label,
      lng: s.lng,
      lat: s.lat,
    }));

    const lastStop = orderedStops[orderedStops.length - 1];
    const destination =
      settings.routePattern === 'round-trip'
        ? origin
        : { label: lastStop.label, lng: lastStop.lng, lat: lastStop.lat };
    const waypoints =
      settings.routePattern === 'round-trip'
        ? orderedStops
        : orderedStops.slice(0, -1);

    const preference = settings.optimizeGoal === 'minimize-distance' ? 'shortest' : 'fastest';
    const session = await orsDirectionsSession({
      origin,
      destination,
      waypoints: waypoints.length ? waypoints : undefined,
      profile: args.profile,
      preference,
      alternatives: 1,
      instructions: false,
      elevation: false,
      apiKey: args.apiKey,
    });

    const fc = session?.options[0]?.featureCollection ?? { type: 'FeatureCollection', features: [] };
    routeGeometries.push(fc as FeatureCollection);

    if (session?.options[0]) {
      route.distanceMeters = Math.round(session.options[0].distanceMeters ?? route.distanceMeters);
      route.durationSeconds = Math.round(session.options[0].durationSeconds ?? route.durationSeconds);
    }
  }

  const mapGeoJson = buildVrpMapGeoJson({
    depot: args.depot,
    routes,
    routeGeometries,
  });

  return {
    depot: args.depot,
    routes,
    report: buildReport({
      routes,
      unassignedStopIds,
      vehicleCount: settings.vehicleCount,
    }),
    mapGeoJson,
  };
}
