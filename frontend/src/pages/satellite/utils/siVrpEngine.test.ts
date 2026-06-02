import { describe, expect, it } from 'vitest';
import { solveVrpGreedy } from './siVrpEngine';
import type { VrpLocation } from './siVrpTypes';

describe('siVrpEngine', () => {
  const depot: VrpLocation = { id: 'depot', label: 'Depot', lng: 0, lat: 0 };
  const stops: VrpLocation[] = [
    { id: 'a', label: 'A', lng: 1, lat: 0 },
    { id: 'b', label: 'B', lng: 0, lat: 1 },
    { id: 'c', label: 'C', lng: 2, lat: 0 },
  ];

  const matrix = {
    durations: [
      [0, 100, 100, 200],
      [100, 0, 141, 100],
      [100, 141, 0, 141],
      [200, 100, 141, 0],
    ],
    distances: [
      [0, 1000, 1000, 2000],
      [1000, 0, 1414, 1000],
      [1000, 1414, 0, 1414],
      [2000, 1000, 1414, 0],
    ],
  };

  it('assigns all stops across vehicles with round trip', () => {
    const { routes, unassignedStopIds } = solveVrpGreedy({
      depot,
      stops,
      settings: {
        vehicleCount: 2,
        maxStopsPerVehicle: 5,
        capacityPerVehicle: null,
        maxRouteTimeMinutes: null,
        optimizeGoal: 'minimize-time',
        routePattern: 'round-trip',
      },
      matrix,
    });
    expect(unassignedStopIds).toHaveLength(0);
    expect(routes.reduce((s, r) => s + r.stopCount, 0)).toBe(3);
  });

  it('respects max stops per vehicle', () => {
    const { routes, unassignedStopIds } = solveVrpGreedy({
      depot,
      stops,
      settings: {
        vehicleCount: 1,
        maxStopsPerVehicle: 1,
        capacityPerVehicle: null,
        maxRouteTimeMinutes: null,
        optimizeGoal: 'minimize-time',
        routePattern: 'round-trip',
      },
      matrix,
    });
    expect(routes[0]?.stopCount).toBe(1);
    expect(unassignedStopIds.length).toBeGreaterThan(0);
  });
});
