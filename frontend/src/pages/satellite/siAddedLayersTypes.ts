/** Minimal custom layer fields used by Added Layers panel (avoids importing Main). */
export type CustomLayer = {
  id: string;
  name: string;
  visible: boolean;
  layerGroup?: string;
  geojson?: unknown;
  source?: string;
  renderMode?: 'vector' | 'raster' | 'bim';
  importMetadata?: { format?: string };
  bimBlobUrl?: string;
  bimModelId?: string;
  bimDiscipline?: string;
  bimCategory?: string;
};

export type SiAddedLayerRowModel = {
  id: string;
  label: string;
  meta?: string;
  visible: boolean;
  toggleable: boolean;
  actionable: boolean;
  sourceLayerId?: string;
  supportsAoiEdit?: boolean;
  supportsRename?: boolean;
  supportsPopupConfig?: boolean;
  onToggle: () => void;
  /** Index in `customLayers` (draw stack). */
  stackIndex?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Small inline busy indicator (map refresh / sync) — does not affect map canvas. */
  busy?: boolean;
};
