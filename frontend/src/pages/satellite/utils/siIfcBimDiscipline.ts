import type { SiBimDiscipline } from './siIfcBimTypes';

const MECHANICAL = new Set([
  'IFCAIRTERMINAL',
  'IFCAIRTERMINALBOX',
  'IFCAIRTOAIRHEATRECOVERY',
  'IFCAIRHANDLINGUNIT',
  'IFCBOILER',
  'IFCCHILLER',
  'IFCCOIL',
  'IFCCOMPRESSOR',
  'IFCCONDENSER',
  'IFCCOOLEDTBEAM',
  'IFCCOOLINGTOWER',
  'IFCDAMPER',
  'IFCDUCTFITTING',
  'IFCDUCTSEGMENT',
  'IFCDUCTSILENCER',
  'IFCFAN',
  'IFCFILTER',
  'IFCFLOWMETER',
  'IFCFLOWMOVINGDEVICE',
  'IFCFLOWCONTROLLER',
  'IFCFLOWINSTRUMENT',
  'IFCFLOWSEGMENT',
  'IFCFLOWTERMINAL',
  'IFCFLOWTREATMENTDEVICE',
  'IFCHEATRECOVERYUNIT',
  'IFCHUMIDIFIER',
  'IFCINTERCEPTOR',
  'IFCTANK',
  'IFCUNITARYEQUIPMENT',
  'IFCVALVE',
]);

const ELECTRICAL = new Set([
  'IFCCABLECARRIERFITTING',
  'IFCCABLECARRIERSEGMENT',
  'IFCCABLEFITTING',
  'IFCCABLESEGMENT',
  'IFCDISTRIBUTIONBOARD',
  'IFCELECTRICDISTRIBUTIONBOARD',
  'IFCELECTRICFLOWSTORAGEDEVICE',
  'IFCELECTRICGENERATOR',
  'IFCELECTRICMOTOR',
  'IFCELECTRICTIMECONTROL',
  'IFCELECTRICAPPLIANCE',
  'IFCLIGHTFIXTURE',
  'IFCOUTLET',
  'IFCPROTECTIVEDEVICE',
  'IFCSWITCHINGDEVICE',
  'IFCTRANSFORMER',
  'IFCJUNCTIONBOX',
]);

const PLUMBING = new Set([
  'IFCFIRESUPPRESSIONTERMINAL',
  'IFCPIPEFITTING',
  'IFCPIPESEGMENT',
  'IFCSANITARYTERMINAL',
  'IFCSTACKTERMINAL',
  'IFCWASTETERMINAL',
  'IFCVALVE',
  'IFCPIPEFITTING',
]);

const STRUCTURAL = new Set([
  'IFCBEAM',
  'IFCBEAMSTANDARDCASE',
  'IFCCOLUMN',
  'IFCCOLUMNSTANDARDCASE',
  'IFCFOOTING',
  'IFCPILE',
  'IFCMEMBER',
  'IFCMEMBERSTANDARDCASE',
  'IFCPLATE',
  'IFCPLATESTANDARDCASE',
  'IFCREINFORCINGBAR',
  'IFCREINFORCINGMESH',
  'IFCTENDON',
  'IFCTENDONANCHOR',
  'IFCSTRUCTURALCURVE',
  'IFCSTRUCTURALSURFACE',
  'IFCSTRUCTURALPOINT',
]);

const ARCHITECTURAL = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCDOOR',
  'IFCDOORSTANDARDCASE',
  'IFCWINDOW',
  'IFCWINDOWSTANDARDCASE',
  'IFCCOVERING',
  'IFCROOF',
  'IFCSTAIR',
  'IFCSTAIRFLIGHT',
  'IFCRAILING',
  'IFCRAMP',
  'IFCRAMPFLIGHT',
  'IFCFURNISHINGELEMENT',
  'IFCBUILDINGELEMENTPROXY',
]);

const EXTERIOR = new Set(['IFCCURTAINWALL', 'IFCSHADINGDEVICE', 'IFCROOF']);

const FLOORS = new Set(['IFCSLAB', 'IFCBUILDINGSTOREY']);

const SPACES = new Set(['IFCSPACE']);

const BUILDING = new Set(['IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSITE', 'IFCPROJECT']);

/** Map IFC entity name → BIM discipline group (ArcGIS Pro–style). */
export function classifyIfcTypeName(typeName: string, objectType?: string): SiBimDiscipline {
  const t = String(typeName ?? '')
    .trim()
    .toUpperCase();
  const ot = String(objectType ?? '')
    .trim()
    .toUpperCase();

  if (/EXTERIOR|FACADE|CLADDING|SHELL|CURTAIN/i.test(ot)) return 'exterior';
  if (/ROOM|SPACE|ZONE/i.test(ot)) return 'spaces';
  if (/FLOOR|STOREY|LEVEL|SLAB|DECK/i.test(ot)) return 'floors';
  if (/DUCT|HVAC|MECH|AIR/i.test(ot)) return 'mechanical';
  if (/ELECT|CABLE|LIGHT/i.test(ot)) return 'electrical';
  if (/PLUMB|PIPE|DRAIN|SANIT/i.test(ot)) return 'plumbing';
  if (/STRUCT|BEAM|COLUMN|REBAR/i.test(ot)) return 'structural';

  if (SPACES.has(t)) return 'spaces';
  if (FLOORS.has(t)) {
    if (t === 'IFCSLAB' && /FLOOR|SLAB|DECK/i.test(ot)) return 'floors';
    if (t === 'IFCBUILDINGSTOREY') return 'floors';
    return 'floors';
  }
  if (BUILDING.has(t)) return 'building';
  if (EXTERIOR.has(t)) return 'exterior';
  if (STRUCTURAL.has(t)) return 'structural';
  if (MECHANICAL.has(t)) return 'mechanical';
  if (ELECTRICAL.has(t)) return 'electrical';
  if (PLUMBING.has(t)) return 'plumbing';
  if (ARCHITECTURAL.has(t)) return 'architectural';

  if (/DUCT|AIR|HVAC|MECH|FAN|CHILL|BOILER|COIL|DAMPER|TERMINAL/i.test(t) || /DUCT|HVAC|MECH/i.test(ot)) {
    return 'mechanical';
  }
  if (/ELECT|CABLE|LIGHT|SWITCH|OUTLET|TRANSFORM|MOTOR|GENERATOR/i.test(t) || /ELECT/i.test(ot)) {
    return 'electrical';
  }
  if (/PIPE|SANIT|PLUMB|DRAIN|WASTE|STACK|VALVE|SPRINKLER/i.test(t) || /PLUMB|PIPE/i.test(ot)) {
    return 'plumbing';
  }
  if (/BEAM|COLUMN|FOOT|PILE|MEMBER|PLATE|REBAR|TENDON|STRUCT/i.test(t) || /STRUCT/i.test(ot)) {
    return 'structural';
  }
  if (/WALL|DOOR|WINDOW|STAIR|RAIL|ROOF|COVER|FURNISH|ARCH/i.test(t)) return 'architectural';
  if (/CURTAIN|SHELL|FACADE|CLADDING|EXTERIOR/i.test(t) || /EXTERIOR|FACADE/i.test(ot)) return 'exterior';
  if (/SPACE|ROOM|ZONE/i.test(t) || /ROOM|SPACE/i.test(ot)) return 'spaces';
  if (/SLAB|FLOOR|STOREY|LEVEL/i.test(t) || /FLOOR|STOREY|LEVEL/i.test(ot)) return 'floors';
  if (/BUILDING|SITE|PROJECT/i.test(t)) return 'building';

  return 'architectural';
}
