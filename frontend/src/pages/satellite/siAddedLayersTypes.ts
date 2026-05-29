/** Minimal custom layer fields used by Added Layers panel (avoids importing Main). */
export type CustomLayer = {
  id: string;
  name: string;
  visible: boolean;
  layerGroup?: string;
  geojson?: unknown;
  source?: string;
  renderMode?: 'vector' | 'raster';
  importMetadata?: { format?: string };
  bimBlobUrl?: string;
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
  onToggle: () => void;
  /** Index in `customLayers` (draw stack). */
  stackIndex?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};
