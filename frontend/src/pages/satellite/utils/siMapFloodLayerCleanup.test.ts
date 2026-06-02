import { describe, expect, it } from 'vitest';
import {
  clearSiFloodAnalysisMapLayers,
  isSiFloodSimulationResultLayer,
  SI_FLOOD_ANALYSIS_LAYER_IDS,
  SI_FLOOD_ANALYSIS_SOURCE_IDS,
} from './siMapFloodLayerCleanup';
import { SI_FLOOD_RESULTS_LAYER_GROUP } from './siMapFloodLayerCleanup';

describe('siMapFloodLayerCleanup', () => {
  it('detects flood simulation result layers', () => {
    expect(isSiFloodSimulationResultLayer({ layerGroup: SI_FLOOD_RESULTS_LAYER_GROUP })).toBe(true);
    expect(isSiFloodSimulationResultLayer({ source: 'flood-simulation' })).toBe(true);
    expect(isSiFloodSimulationResultLayer({ id: 'flood-depth-123' })).toBe(true);
    expect(isSiFloodSimulationResultLayer({ id: 'custom-upload-1', source: 'upload' })).toBe(false);
  });

  it('clears flood analysis map layers and sources', () => {
    const removedLayers: string[] = [];
    const removedSources: string[] = [];
    const map = {
      getStyle: () => ({ layers: SI_FLOOD_ANALYSIS_LAYER_IDS.map(id => ({ id })) }),
      getLayer: (id: string) => SI_FLOOD_ANALYSIS_LAYER_IDS.includes(id as (typeof SI_FLOOD_ANALYSIS_LAYER_IDS)[number]),
      removeLayer: (id: string) => {
        removedLayers.push(id);
      },
      getSource: (id: string) =>
        SI_FLOOD_ANALYSIS_SOURCE_IDS.includes(id as (typeof SI_FLOOD_ANALYSIS_SOURCE_IDS)[number]),
      removeSource: (id: string) => {
        removedSources.push(id);
      },
    };
    clearSiFloodAnalysisMapLayers(map as never);
    expect(removedLayers.length).toBe(SI_FLOOD_ANALYSIS_LAYER_IDS.length);
    expect(removedSources.length).toBe(SI_FLOOD_ANALYSIS_SOURCE_IDS.length);
  });
});
