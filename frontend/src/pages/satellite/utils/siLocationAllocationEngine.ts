import type { Feature, FeatureCollection, LineString } from 'geojson';
import type {
  LaAnalysisReport,
  LaAssignment,
  LaImpedanceAttribute,
  LaPoint,
  LaProblemType,
  LaSolveInput,
  LaSolveResult,
} from './siLocationAllocationTypes';

export type LaCostMatrix = {
  /** rows = demand index, cols = facility+candidate index */
  costs: number[][];
  facilityColumns: LaPoint[];
  metric: 'seconds' | 'meters';
};

const EARTH_R = 6371000;

function haversineMeters(a: LaPoint, b: LaPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function estimateTravelSeconds(meters: number, profile: 'walk' | 'drive' | 'bike'): number {
  const speed =
    profile === 'walk' ? 1.4 : profile === 'bike' ? 4.5 : 11.1;
  return meters / speed;
}

/** Straight-line impedance matrix (network fallback). */
export function buildHaversineCostMatrix(
  demands: LaPoint[],
  facilityColumns: LaPoint[],
  impedance: LaImpedanceAttribute,
  profile: 'walk' | 'drive' | 'bike' = 'drive',
): LaCostMatrix {
  const costs = demands.map(d =>
    facilityColumns.map(f => {
      const m = haversineMeters(d, f);
      return impedance === 'Distance' ? m : estimateTravelSeconds(m, profile);
    }),
  );
  return {
    costs,
    facilityColumns,
    metric: impedance === 'Distance' ? 'meters' : 'seconds',
  };
}

function pointsNear(a: LaPoint, b: LaPoint, toleranceM = 40): boolean {
  return haversineMeters(a, b) <= toleranceM;
}

export function defaultCandidateSites(facilities: LaPoint[], demands: LaPoint[]): LaPoint[] {
  return demands.filter(d => !facilities.some(f => pointsNear(f, d)));
}

function assignDemandsToFacilities(
  demands: LaPoint[],
  activeFacilities: LaPoint[],
  matrix: LaCostMatrix,
  cutoff?: number,
): LaAssignment[] {
  const colIndex = new Map<string, number>();
  matrix.facilityColumns.forEach((f, i) => colIndex.set(f.id, i));

  return demands.map((d, row) => {
    let bestId = activeFacilities[0]?.id ?? '';
    let bestCost = Number.POSITIVE_INFINITY;
    for (const fac of activeFacilities) {
      const col = colIndex.get(fac.id);
      if (col == null) continue;
      const c = matrix.costs[row]?.[col] ?? Number.POSITIVE_INFINITY;
      if (c < bestCost) {
        bestCost = c;
        bestId = fac.id;
      }
    }
    const covered = cutoff == null || bestCost <= cutoff;
    return {
      demandId: d.id,
      facilityId: bestId,
      cost: Number.isFinite(bestCost) ? bestCost : 0,
      covered,
    };
  });
}

function totalImpedance(assignments: LaAssignment[], demands: LaPoint[]): number {
  const w = new Map(demands.map(d => [d.id, d.weight ?? 1]));
  return assignments.reduce((sum, a) => sum + (w.get(a.demandId) ?? 1) * a.cost, 0);
}

function coveredWeight(assignments: LaAssignment[], demands: LaPoint[]): number {
  const w = new Map(demands.map(d => [d.id, d.weight ?? 1]));
  return assignments.filter(a => a.covered).reduce((s, a) => s + (w.get(a.demandId) ?? 1), 0);
}

function greedyAddFacilities(
  input: LaSolveInput,
  matrix: LaCostMatrix,
  candidates: LaPoint[],
  k: number,
  problemType: LaProblemType,
): { selected: LaPoint[]; newIds: string[] } {
  const existing = [...input.facilities];
  const selectedNew: LaPoint[] = [];
  const picked = new Set<string>();

  for (let round = 0; round < k; round++) {
    let bestCandidate: LaPoint | null = null;
    let bestScore = problemType === 'MAXIMIZE_COVERAGE' ? -1 : Number.POSITIVE_INFINITY;

    for (const cand of candidates) {
      if (picked.has(cand.id)) continue;
      const trial = [...existing, ...selectedNew, cand];
      const assign = assignDemandsToFacilities(input.demandPoints, trial, matrix, input.cutoff);

      if (problemType === 'MAXIMIZE_COVERAGE' || problemType === 'MAXIMIZE_ATTENDANCE') {
        const score = coveredWeight(assign, input.demandPoints);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = cand;
        }
      } else {
        const score = totalImpedance(assign, input.demandPoints);
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = cand;
        }
      }
    }

    if (!bestCandidate) break;
    picked.add(bestCandidate.id);
    selectedNew.push({ ...bestCandidate, label: bestCandidate.label ?? `⭐ New site ${selectedNew.length + 1}` });
  }

  return { selected: [...existing, ...selectedNew], newIds: selectedNew.map(f => f.id) };
}

export function solveLocationAllocation(input: LaSolveInput, matrix: LaCostMatrix): LaSolveResult {
  const demands = input.demandPoints;
  const candidates = input.candidatePoints ?? defaultCandidateSites(input.facilities, demands);
  const k = Math.max(0, Math.min(input.numberOfFacilitiesToLocate, candidates.length));

  const { selected, newIds } =
    k > 0
      ? greedyAddFacilities(input, matrix, candidates, k, input.problemType)
      : { selected: [...input.facilities], newIds: [] as string[] };

  const assignments = assignDemandsToFacilities(demands, selected, matrix, input.cutoff);
  const totalW = demands.reduce((s, d) => s + (d.weight ?? 1), 0);
  const servedW = coveredWeight(assignments, demands);
  const servedCosts = assignments.filter(a => a.covered).map(a => a.cost);
  const avg =
    servedCosts.length > 0 ? servedCosts.reduce((a, b) => a + b, 0) / servedCosts.length : 0;
  const max = servedCosts.length > 0 ? Math.max(...servedCosts) : 0;

  const impedanceLabel =
    matrix.metric === 'meters'
      ? 'Distance (m)'
      : input.impedanceAttribute === 'TravelTime'
        ? 'Travel time (s)'
        : 'Impedance';

  const report: LaAnalysisReport = {
    totalDemandServed: servedW,
    totalDemandWeight: totalW,
    coveragePercent: totalW > 0 ? (servedW / totalW) * 100 : 0,
    averageTravelCost: avg,
    maxTravelCost: max,
    impedanceLabel,
  };

  return {
    selectedFacilities: selected.map(f => ({
      ...f,
      label:
        newIds.includes(f.id) ? f.label ?? '⭐ Optimal site' : f.label ?? 'Existing facility',
    })),
    newFacilityIds: newIds,
    assignments,
    report,
  };
}

export function buildLocationAllocationGeoJson(
  input: LaSolveInput,
  result: LaSolveResult,
  matrix: LaCostMatrix,
): {
  facilities: FeatureCollection;
  allocatedDemand: FeatureCollection;
  allocationLinks: FeatureCollection;
} {
  const demandById = new Map(input.demandPoints.map(d => [d.id, d]));
  const facById = new Map(result.selectedFacilities.map(f => [f.id, f]));

  const facilities: FeatureCollection = {
    type: 'FeatureCollection',
    features: result.selectedFacilities.map(f => ({
      type: 'Feature',
      properties: {
        role: 'la-facility',
        facilityRole: result.newFacilityIds.includes(f.id) ? 'new-optimal' : 'existing',
        label: result.newFacilityIds.includes(f.id) ? `⭐ ${f.label ?? 'New site'}` : f.label ?? 'Facility',
        facilityId: f.id,
      },
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
    })),
  };

  const allocatedDemand: FeatureCollection = {
    type: 'FeatureCollection',
    features: result.assignments.map(a => {
      const d = demandById.get(a.demandId);
      const f = facById.get(a.facilityId);
      return {
        type: 'Feature',
        properties: {
          role: 'la-demand',
          demandId: a.demandId,
          facilityId: a.facilityId,
          travelCost: Math.round(a.cost),
          covered: a.covered,
          label: d?.label ?? a.demandId,
          facilityLabel: f?.label ?? a.facilityId,
        },
        geometry: {
          type: 'Point',
          coordinates: [d?.lng ?? 0, d?.lat ?? 0],
        },
      };
    }),
  };

  const linkFeatures: Feature[] = result.assignments
    .map(a => {
      const d = demandById.get(a.demandId);
      const f = facById.get(a.facilityId);
      if (!d || !f) return null;
      return {
        type: 'Feature',
        properties: {
          role: 'la-allocation-link',
          linkId: `${a.demandId}__${a.facilityId}`,
          demandId: a.demandId,
          facilityId: a.facilityId,
          travelCost: Math.round(a.cost),
          covered: a.covered,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [f.lng, f.lat],
            [d.lng, d.lat],
          ],
        } as LineString,
      };
    })
    .filter(Boolean) as Feature[];

  const allocationLinks: FeatureCollection = {
    type: 'FeatureCollection',
    features: linkFeatures,
  };

  return { facilities, allocatedDemand, allocationLinks };
}

/** Parse `lat,lng` or `label, lat, lng` lines. */
export function parseLaPointLines(text: string, prefix: string): LaPoint[] {
  const out: LaPoint[] = [];
  text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split(/[,;\t]/).map(p => p.trim()).filter(Boolean);
      let label: string | undefined;
      let lat: number;
      let lng: number;
      if (parts.length >= 2 && Number.isFinite(Number(parts[parts.length - 2]))) {
        lat = Number(parts[parts.length - 2]);
        lng = Number(parts[parts.length - 1]);
        if (parts.length > 2) label = parts.slice(0, -2).join(', ');
      } else if (parts.length >= 2) {
        lng = Number(parts[0]);
        lat = Number(parts[1]);
        if (parts.length > 2) label = parts.slice(2).join(', ');
      } else return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      out.push({
        id: `${prefix}-${i}-${lng.toFixed(5)}-${lat.toFixed(5)}`,
        lat,
        lng,
        label: label || `${prefix} ${i + 1}`,
        weight: 1,
      });
    });
  return out;
}

export function formatLaCost(value: number, matrix: LaCostMatrix): string {
  if (matrix.metric === 'meters') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
  }
  const min = Math.round(value / 60);
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
}
