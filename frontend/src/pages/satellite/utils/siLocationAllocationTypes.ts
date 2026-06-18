/** Location-Allocation GIS tool — ArcGIS-style problem types. */
export type LaProblemType =
  | 'MINIMIZE_IMPEDANCE'
  | 'MAXIMIZE_COVERAGE'
  | 'MAXIMIZE_ATTENDANCE'
  | 'MINIMIZE_FACILITIES'
  | 'MAXIMIZE_CAPACITY';

export type LaTravelDirection = 'FACILITY_TO_DEMAND' | 'DEMAND_TO_FACILITY';

export type LaImpedanceAttribute = 'TravelTime' | 'Distance';

export type LaPoint = {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  /** Demand weight (default 1). */
  weight?: number;
};

export type LaAssignment = {
  demandId: string;
  facilityId: string;
  cost: number;
  covered: boolean;
};

export type LaAnalysisReport = {
  totalDemandServed: number;
  totalDemandWeight: number;
  coveragePercent: number;
  averageTravelCost: number;
  maxTravelCost: number;
  impedanceLabel: string;
};

export type LaSolveInput = {
  facilities: LaPoint[];
  demandPoints: LaPoint[];
  problemType: LaProblemType;
  numberOfFacilitiesToLocate: number;
  impedanceAttribute: LaImpedanceAttribute;
  travelDirection: LaTravelDirection;
  cutoff?: number;
  /** When omitted, demand points (not collocated with existing facilities) are candidates. */
  candidatePoints?: LaPoint[];
};

export type LaSolveResult = {
  selectedFacilities: LaPoint[];
  newFacilityIds: string[];
  assignments: LaAssignment[];
  report: LaAnalysisReport;
};

export const LA_OUTPUT_LAYER_GROUP = 'LocationAllocation_Result';
