/** Vehicle Routing Problem — network analysis types. */
export type VrpOptimizeGoal = 'minimize-time' | 'minimize-distance';
export type VrpRoutePattern = 'round-trip' | 'one-way';

export type VrpLocation = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  /** Stop demand units (default 1). */
  demand?: number;
};

export type VrpSettings = {
  vehicleCount: number;
  maxStopsPerVehicle: number;
  capacityPerVehicle: number | null;
  maxRouteTimeMinutes: number | null;
  optimizeGoal: VrpOptimizeGoal;
  routePattern: VrpRoutePattern;
};

export type VrpRouteStop = {
  locationId: string;
  label: string;
  sequence: number;
  lng: number;
  lat: number;
};

export type VrpVehicleRoute = {
  vehicleId: number;
  vehicleLabel: string;
  color: string;
  stops: VrpRouteStop[];
  distanceMeters: number;
  durationSeconds: number;
  stopCount: number;
  utilizationPercent: number;
};

export type VrpAnalysisReport = {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalStops: number;
  vehicleCount: number;
  averageUtilizationPercent: number;
  unassignedStopIds: string[];
  distanceLabel: string;
  durationLabel: string;
};

export type VrpSolveResult = {
  depot: VrpLocation;
  routes: VrpVehicleRoute[];
  report: VrpAnalysisReport;
  mapGeoJson: GeoJSON.FeatureCollection;
};

export const DEFAULT_VRP_SETTINGS: VrpSettings = {
  vehicleCount: 2,
  maxStopsPerVehicle: 10,
  capacityPerVehicle: null,
  maxRouteTimeMinutes: null,
  optimizeGoal: 'minimize-time',
  routePattern: 'round-trip',
};

export const VRP_VEHICLE_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#eab308',
  '#f97316',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
] as const;

export type RouteMapMatrixSubMode = 'od-matrix' | 'vrp';
