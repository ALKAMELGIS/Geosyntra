import type { RouteMapProfile } from '../../../lib/openRouteServiceRouting';
import { resolveOrsApiKey } from '../../../lib/openRouteServiceRouting';
import { resolveApiUrl } from '../../../lib/apiClient';
import { readAccessToken } from '../../../lib/auth';
import { mustUseApiGateway } from '../../../lib/platformTokenRuntime';
import type { LaImpedanceAttribute, LaPoint } from './siLocationAllocationTypes';
import {
  buildHaversineCostMatrix,
  type LaCostMatrix,
} from './siLocationAllocationEngine';

const ORS_API = 'https://api.openrouteservice.org';

function orsProfileFromRouteMap(profile: RouteMapProfile): string {
  if (profile === 'foot') return 'foot-walking';
  if (profile === 'bike') return 'cycling-regular';
  if (profile === 'truck') return 'driving-hgv';
  return 'driving-car';
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

function profileMode(profile: RouteMapProfile): 'walk' | 'drive' | 'bike' {
  if (profile === 'foot') return 'walk';
  if (profile === 'bike') return 'bike';
  return 'drive';
}

/**
 * Demand → facility+candidate cost matrix using ORS matrix sources/destinations.
 */
export async function buildLaNetworkCostMatrix(args: {
  demands: LaPoint[];
  facilityColumns: LaPoint[];
  profile: RouteMapProfile;
  impedanceAttribute: LaImpedanceAttribute;
  apiKey?: string;
}): Promise<LaCostMatrix> {
  const { demands, facilityColumns, profile, impedanceAttribute } = args;
  const apiKey = args.apiKey?.trim() || resolveOrsApiKey();
  if (!apiKey || demands.length === 0 || facilityColumns.length === 0) {
    return buildHaversineCostMatrix(
      demands,
      facilityColumns,
      impedanceAttribute,
      profileMode(profile),
    );
  }

  const all = [...demands, ...facilityColumns];
  const sources = demands.map((_, i) => i);
  const destinations = facilityColumns.map((_, i) => i + demands.length);

  try {
    const orsProfile = orsProfileFromRouteMap(profile);
    const data = await orsPost<{
      durations?: (number | null)[][];
      distances?: (number | null)[][];
    }>(
      `/v2/matrix/${orsProfile}`,
      {
        locations: all.map(p => [p.lng, p.lat]),
        sources,
        destinations,
        metrics: ['duration', 'distance'],
      },
      apiKey,
    );

    const durations = Array.isArray(data?.durations) ? data.durations : [];
    const distances = Array.isArray(data?.distances) ? data.distances : [];
    const useDistance = impedanceAttribute === 'Distance';
    const costs = demands.map((_, row) =>
      facilityColumns.map((_, col) => {
        const raw = useDistance ? distances[row]?.[col] : durations[row]?.[col];
        if (raw == null || !Number.isFinite(raw)) {
          return buildHaversineCostMatrix(
            [demands[row]],
            [facilityColumns[col]],
            impedanceAttribute,
            profileMode(profile),
          ).costs[0][0];
        }
        return raw;
      }),
    );

    return {
      costs,
      facilityColumns,
      metric: useDistance ? 'meters' : 'seconds',
    };
  } catch {
    return buildHaversineCostMatrix(
      demands,
      facilityColumns,
      impedanceAttribute,
      profileMode(profile),
    );
  }
}
