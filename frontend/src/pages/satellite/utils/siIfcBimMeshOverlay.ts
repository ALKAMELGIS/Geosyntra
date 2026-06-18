import type { Map as MapboxMap } from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SI_BIM_CATEGORY_COLORS, type SiBimCategory } from './siIfcBimCategories';
import { getSiBimModel } from './siIfcBimModelStore';

const SI_IFC_BIM_MESH_OPACITY = 215;

type BimMeshRuntime = { overlay: MapboxOverlay; modelId: string };
const runtimeByMap = new WeakMap<MapboxMap, BimMeshRuntime>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildMeshLayers(modelId: string, visibleCategories?: Set<SiBimCategory>) {
  const model = getSiBimModel(modelId);
  if (!model?.categoryMeshes) return [];

  const [originLng, originLat, originZ] = model.coordinateOrigin;
  const layers: SimpleMeshLayer[] = [];

  for (const [cat, mesh] of Object.entries(model.categoryMeshes) as [
    SiBimCategory,
    NonNullable<(typeof model.categoryMeshes)[SiBimCategory]>,
  ][]) {
    if (!mesh) continue;
    if (visibleCategories && !visibleCategories.has(cat)) continue;
    const color = hexToRgb(SI_BIM_CATEGORY_COLORS[cat] ?? '#64748b');
    const alpha = SI_IFC_BIM_MESH_OPACITY;
    layers.push(
      new SimpleMeshLayer({
        id: `si-ifc-mesh-${modelId}-${cat}`,
        mesh: {
          attributes: {
            POSITION: { value: mesh.positions, size: 3 },
          },
          indices: { value: mesh.indices, size: 1 },
        },
        data: [1],
        getPosition: () => [0, 0, 0],
        getColor: [...color, alpha],
        coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
        coordinateOrigin: [originLng, originLat, originZ],
        pickable: true,
        _lighting: 'pbr',
      }),
    );
  }
  return layers;
}

export function syncSiIfcBimMeshOverlay(
  map: MapboxMap,
  modelId: string | null,
  opts?: { visible?: boolean; visibleCategories?: SiBimCategory[] },
): void {
  if (!modelId || opts?.visible === false) {
    detachSiIfcBimMeshOverlay(map);
    return;
  }

  const model = getSiBimModel(modelId);
  if (!model?.categoryMeshes || !Object.keys(model.categoryMeshes).length) {
    detachSiIfcBimMeshOverlay(map);
    return;
  }

  const visibleSet = opts?.visibleCategories ? new Set(opts.visibleCategories) : undefined;
  const layers = buildMeshLayers(modelId, visibleSet);
  if (!layers.length) {
    detachSiIfcBimMeshOverlay(map);
    return;
  }

  const existing = runtimeByMap.get(map);
  if (existing?.modelId === modelId) {
    existing.overlay.setProps({ layers });
    return;
  }

  detachSiIfcBimMeshOverlay(map);
  const overlay = new MapboxOverlay({ interleaved: false, layers });
  map.addControl(overlay);
  runtimeByMap.set(map, { overlay, modelId });
}

export function detachSiIfcBimMeshOverlay(map: MapboxMap): void {
  const rt = runtimeByMap.get(map);
  if (!rt) return;
  try {
    map.removeControl(rt.overlay);
  } catch {
    /* already removed */
  }
  runtimeByMap.delete(map);
}
