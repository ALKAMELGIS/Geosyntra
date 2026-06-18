import { describe, expect, it } from 'vitest';
import {
  buildHaversineCostMatrix,
  defaultCandidateSites,
  solveLocationAllocation,
} from './siLocationAllocationEngine';
import type { LaPoint } from './siLocationAllocationTypes';

const facilities: LaPoint[] = [
  { id: 'f1', lng: -122.33, lat: 47.6, label: 'Existing A', weight: 1 },
];

const demands: LaPoint[] = [
  { id: 'd1', lng: -122.34, lat: 47.61, weight: 1 },
  { id: 'd2', lng: -122.31, lat: 47.59, weight: 1 },
  { id: 'd3', lng: -122.28, lat: 47.58, weight: 2 },
];

describe('solveLocationAllocation', () => {
  it('picks a new facility that reduces total impedance', () => {
    const candidates = defaultCandidateSites(facilities, demands);
    const matrix = buildHaversineCostMatrix(demands, [...facilities, ...candidates], 'TravelTime');
    const result = solveLocationAllocation(
      {
        facilities,
        demandPoints: demands,
        problemType: 'MINIMIZE_IMPEDANCE',
        numberOfFacilitiesToLocate: 1,
        impedanceAttribute: 'TravelTime',
        travelDirection: 'DEMAND_TO_FACILITY',
        candidatePoints: candidates,
      },
      matrix,
    );
    expect(result.newFacilityIds.length).toBe(1);
    expect(result.selectedFacilities.length).toBe(2);
    expect(result.assignments.length).toBe(3);
    expect(result.report.totalDemandWeight).toBe(4);
  });

  it('maximizes coverage within cutoff', () => {
    const candidates = defaultCandidateSites([], demands);
    const matrix = buildHaversineCostMatrix(demands, candidates, 'TravelTime');
    const result = solveLocationAllocation(
      {
        facilities: [],
        demandPoints: demands,
        problemType: 'MAXIMIZE_COVERAGE',
        numberOfFacilitiesToLocate: 1,
        impedanceAttribute: 'TravelTime',
        travelDirection: 'DEMAND_TO_FACILITY',
        cutoff: 600,
        candidatePoints: candidates,
      },
      matrix,
    );
    expect(result.newFacilityIds.length).toBe(1);
    expect(result.report.coveragePercent).toBeGreaterThan(0);
  });
});
