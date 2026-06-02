/** ArcGIS Pro–style BIM feature categories (Discipline → Category → Attributes). */

export const SI_BIM_CATEGORIES = [
  'buildings',
  'floors',
  'levels',
  'spaces',
  'rooms',
  'walls',
  'doors',
  'windows',
  'roofs',
  'columns',
  'beams',
  'slabs',
  'stairs',
  'mechanical',
  'electrical',
  'plumbing',
  'structural',
  'infrastructure',
  'other',
] as const;

export type SiBimCategory = (typeof SI_BIM_CATEGORIES)[number];

export const SI_BIM_CATEGORY_LABELS: Record<SiBimCategory, string> = {
  buildings: 'Buildings',
  floors: 'Floors',
  levels: 'Levels',
  spaces: 'Spaces',
  rooms: 'Rooms',
  walls: 'Walls',
  doors: 'Doors',
  windows: 'Windows',
  roofs: 'Roofs',
  columns: 'Columns',
  beams: 'Beams',
  slabs: 'Slabs',
  stairs: 'Stairs',
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  structural: 'Structural',
  infrastructure: 'Infrastructure',
  other: 'Other Elements',
};

export const SI_BIM_CATEGORY_COLORS: Record<SiBimCategory, string> = {
  buildings: '#64748b',
  floors: '#a78bfa',
  levels: '#8b5cf6',
  spaces: '#fb7185',
  rooms: '#f472b6',
  walls: '#60a5fa',
  doors: '#38bdf8',
  windows: '#22d3ee',
  roofs: '#94a3b8',
  columns: '#f97316',
  beams: '#fb923c',
  slabs: '#cbd5e1',
  stairs: '#818cf8',
  mechanical: '#2dd4bf',
  electrical: '#facc15',
  plumbing: '#34d399',
  structural: '#ea580c',
  infrastructure: '#78716c',
  other: '#9ca3af',
};

const DIRECT: Record<string, SiBimCategory> = {
  IFCBUILDING: 'buildings',
  IFCBUILDINGSTOREY: 'floors',
  IFCSPACE: 'spaces',
  IFCWALL: 'walls',
  IFCWALLSTANDARDCASE: 'walls',
  IFCDOOR: 'doors',
  IFCDOORSTANDARDCASE: 'doors',
  IFCWINDOW: 'windows',
  IFCWINDOWSTANDARDCASE: 'windows',
  IFCROOF: 'roofs',
  IFCCOLUMN: 'columns',
  IFCCOLUMNSTANDARDCASE: 'columns',
  IFCBEAM: 'beams',
  IFCBEAMSTANDARDCASE: 'beams',
  IFCSLAB: 'slabs',
  IFCSTAIR: 'stairs',
  IFCSTAIRFLIGHT: 'stairs',
  IFCMEMBER: 'structural',
  IFCMEMBERSTANDARDCASE: 'structural',
  IFCPLATE: 'structural',
  IFCFOOTING: 'structural',
  IFCPILE: 'structural',
  IFCCURTAINWALL: 'walls',
  IFCRAILING: 'stairs',
  IFCCOVERING: 'walls',
  IFCDUCTSEGMENT: 'mechanical',
  IFCAIRTERMINAL: 'mechanical',
  IFCFAN: 'mechanical',
  IFCBOILER: 'mechanical',
  IFCPIPESEGMENT: 'plumbing',
  IFCSANITARYTERMINAL: 'plumbing',
  IFCLIGHTFIXTURE: 'electrical',
  IFCCABLESEGMENT: 'electrical',
  IFCDISTRIBUTIONELEMENT: 'mechanical',
  IFCDISTRIBUTIONCHAMBERELEMENT: 'infrastructure',
  IFCCIVILELEMENT: 'infrastructure',
  IFCBUILDINGELEMENTPROXY: 'other',
  IFCSITE: 'infrastructure',
  IFCPROJECT: 'buildings',
};

export function classifyIfcCategory(typeName: string, objectType?: string): SiBimCategory {
  const t = String(typeName ?? '')
    .trim()
    .toUpperCase()
    .replace(/^IFC/, 'IFC');
  const key = t.startsWith('IFC') ? t : `IFC${t}`;
  if (DIRECT[key]) return DIRECT[key]!;

  const ot = String(objectType ?? '').toUpperCase();
  if (/ROOM/.test(ot)) return 'rooms';
  if (/SPACE|ZONE/.test(ot)) return 'spaces';
  if (/LEVEL|STOREY|FLOOR/.test(ot)) return 'levels';
  if (/WALL|PARTITION|CLADDING/.test(t) || /WALL/.test(ot)) return 'walls';
  if (/DOOR/.test(t)) return 'doors';
  if (/WINDOW/.test(t)) return 'windows';
  if (/ROOF/.test(t)) return 'roofs';
  if (/COLUMN|PILLAR/.test(t)) return 'columns';
  if (/BEAM|GIRDER/.test(t)) return 'beams';
  if (/SLAB|FLOOR|DECK/.test(t)) return 'slabs';
  if (/STAIR|RAMP/.test(t)) return 'stairs';
  if (/DUCT|HVAC|AIR|MECH|FAN|CHILL|BOILER|COIL/.test(t)) return 'mechanical';
  if (/ELECT|CABLE|LIGHT|SWITCH|OUTLET/.test(t)) return 'electrical';
  if (/PIPE|PLUMB|SANIT|DRAIN|VALVE/.test(t)) return 'plumbing';
  if (/FOOT|PILE|REBAR|STRUCT|FRAME/.test(t)) return 'structural';
  if (/ROAD|BRIDGE|TUNNEL|RAIL|INFRA|SITE/.test(t)) return 'infrastructure';
  if (/BUILDING|PROJECT/.test(t)) return 'buildings';

  return 'other';
}

export function emptyCategoryCollections(): Record<SiBimCategory, GeoJSON.FeatureCollection> {
  const out = {} as Record<SiBimCategory, GeoJSON.FeatureCollection>;
  for (const c of SI_BIM_CATEGORIES) out[c] = { type: 'FeatureCollection', features: [] };
  return out;
}

export function emptyCategoryStats(): Record<SiBimCategory, number> {
  const out = {} as Record<SiBimCategory, number>;
  for (const c of SI_BIM_CATEGORIES) out[c] = 0;
  return out;
}
