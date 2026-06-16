import { siMapLeftPopoutFixedPosition } from './siMapFloatingPanelLayout';

const LEGEND_STACK_GAP_PX = 10;
const LEGEND_PANEL_HEIGHT_PX = 280;

/** Stack multiple per-layer legends without overlapping the spectral-legend anchor. */
export function siMapDynamicLegendStackPosition(stackIndex: number, panelHeight = LEGEND_PANEL_HEIGHT_PX): {
  left: number;
  top: number;
} {
  const base = siMapLeftPopoutFixedPosition('spectral-legend', panelHeight);
  const idx = Math.max(0, stackIndex);
  return {
    left: base.left,
    top: base.top + idx * (panelHeight + LEGEND_STACK_GAP_PX),
  };
}

export function siMapLayerLegendOffsetStorageKey(layerKey: string): string {
  return `si-map-layer-legend-offset-v1:${layerKey}`;
}
