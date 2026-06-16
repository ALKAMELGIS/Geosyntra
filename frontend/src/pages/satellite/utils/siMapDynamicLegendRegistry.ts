import { inferWmsEvalProfile, type WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { buildSiLayerLegendRows, type SiLayerLegendRow } from '../symbologyHelpers';
import type { SiIndexClassAnalytics } from './siIndexClassAnalytics';
import { SI_CROP_HEALTH_CONDITION_META, type SiCropHealthCondition } from './siCropHealthTypes';
import type { SiWmsSpectralLegendContext } from '../components/SiWmsIndexClassificationLegend';
import { siWmsResolveLegendDisplayMode, siWmsShowsSpectralLegend, type SiWmsLegendDisplayMode } from './siWmsLegendMode';
import { siWmsResolveCanonicalStops } from './siWmsSpectralClassification';
import type { SiWmsSymbologyUiState } from './siWmsSymbologyModel';

export type SiMapDynamicLegendWmsEntry = {
  kind: 'wms';
  layerKey: string;
  layerId: string;
  label: string;
  profile: WmsAoiEvalProfile;
  displayMode: Exclude<SiWmsLegendDisplayMode, 'none'>;
  context: SiWmsSpectralLegendContext;
  symbologyPartial?: Partial<SiWmsSymbologyUiState>;
  classifiedStops: readonly IndexRampStop[] | null;
  classAnalytics?: SiIndexClassAnalytics | null;
  dataDrivenLabels: boolean;
};

export type SiMapDynamicLegendVectorEntry = {
  kind: 'vector';
  layerKey: string;
  layerId: string;
  label: string;
  rows: SiLayerLegendRow[];
};

export type SiMapDynamicLegendAlertsEntry = {
  kind: 'alerts';
  layerKey: string;
  label: string;
  rows: SiLayerLegendRow[];
};

export type SiMapDynamicLegendEntry =
  | SiMapDynamicLegendWmsEntry
  | SiMapDynamicLegendVectorEntry
  | SiMapDynamicLegendAlertsEntry;

export type SiMapDynamicLegendCustomLayerInput = {
  id: string;
  name?: string;
  visible?: boolean;
  geojson?: GeoJSON.FeatureCollection | null;
  source?: string;
  symbology?: unknown;
  color?: string;
  fillColor?: string;
  weight?: number;
  polygonFillAlpha?: number;
  useArcGisSymbology?: boolean;
  arcgisDrawingInfo?: Record<string, unknown> | null;
  arcgisLayerDefinition?: unknown;
  renderMode?: string;
};

const CROP_HEALTH_ALERT_ROWS: SiLayerLegendRow[] = (
  Object.keys(SI_CROP_HEALTH_CONDITION_META) as SiCropHealthCondition[]
).map(k => ({
  label: SI_CROP_HEALTH_CONDITION_META[k].label,
  color: SI_CROP_HEALTH_CONDITION_META[k].color,
}));

function vectorLegendRows(layer: SiMapDynamicLegendCustomLayerInput): SiLayerLegendRow[] {
  if (layer.visible === false) return [];
  return buildSiLayerLegendRows(layer, { maxItems: 24 });
}

/** One legend descriptor per visible operational layer — no shared static ramp. */
export function buildSiMapDynamicLegendEntries(input: {
  wmsLayerId: string;
  wmsVisible: boolean;
  wmsLabel: string;
  wmsContext: SiWmsSpectralLegendContext;
  wmsSymbologyPartial?: Partial<SiWmsSymbologyUiState>;
  wmsAoiFiniteValues?: readonly number[] | null;
  wmsClassAnalytics?: SiIndexClassAnalytics | null;
  hasAoiGeometry: boolean;
  customLayers: SiMapDynamicLegendCustomLayerInput[];
  cropHealthAlertsVisible: boolean;
  resolveStops?: (
    layerId: string,
    symbology?: Partial<SiWmsSymbologyUiState>,
    aoiValues?: readonly number[] | null,
  ) => readonly IndexRampStop[] | null;
}): SiMapDynamicLegendEntry[] {
  const entries: SiMapDynamicLegendEntry[] = [];
  const resolveStops = input.resolveStops ?? siWmsResolveCanonicalStops;

  const wmsId = input.wmsLayerId.trim();
  if (input.wmsVisible && wmsId) {
    const profile = inferWmsEvalProfile(wmsId);
    const displayMode = siWmsResolveLegendDisplayMode({
      profile,
      layerId: wmsId,
      sentinelVisible: true,
      hasAoiGeometry: input.hasAoiGeometry,
      symbologyPartial: input.wmsSymbologyPartial,
    });
    if (displayMode !== 'none' && siWmsShowsSpectralLegend(profile)) {
      const classifiedStops = resolveStops(wmsId, input.wmsSymbologyPartial, input.wmsAoiFiniteValues);
      const dataDrivenLabels = Boolean(
        input.wmsAoiFiniteValues?.length ||
          (input.wmsSymbologyPartial &&
            Object.keys(input.wmsSymbologyPartial).length > 0 &&
            input.wmsSymbologyPartial.autoScientific === false),
      );
      entries.push({
        kind: 'wms',
        layerKey: `wms:${wmsId}`,
        layerId: wmsId,
        label: input.wmsLabel.trim() || wmsId,
        profile,
        displayMode,
        context: input.wmsContext,
        symbologyPartial: input.wmsSymbologyPartial,
        classifiedStops,
        classAnalytics: input.wmsClassAnalytics ?? null,
        dataDrivenLabels,
      });
    }
  }

  for (const layer of input.customLayers) {
    if (layer.visible === false) continue;
    const rows = vectorLegendRows(layer);
    if (!rows.length) continue;
    entries.push({
      kind: 'vector',
      layerKey: `vector:${layer.id}`,
      layerId: layer.id,
      label: layer.name?.trim() || layer.id,
      rows,
    });
  }

  if (input.cropHealthAlertsVisible) {
    entries.push({
      kind: 'alerts',
      layerKey: 'alerts:crop-health',
      label: 'Crop health alerts',
      rows: CROP_HEALTH_ALERT_ROWS,
    });
  }

  return entries;
}
