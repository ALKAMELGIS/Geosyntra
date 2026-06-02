import { describe, expect, it } from 'vitest';
import { classifyIfcCategory } from './siIfcBimCategories';
import { classifyIfcTypeName } from './siIfcBimDiscipline';
import { ifcAngleToDegrees, parseIfcSchemaFromHeader } from './siIfcBimGeoref';

describe('classifyIfcCategory', () => {
  it('maps core IFC types to ArcGIS-style categories', () => {
    expect(classifyIfcCategory('IfcWall')).toBe('walls');
    expect(classifyIfcCategory('IfcDoor')).toBe('doors');
    expect(classifyIfcCategory('IfcSpace')).toBe('spaces');
    expect(classifyIfcCategory('IfcColumn')).toBe('columns');
    expect(classifyIfcCategory('IfcPipeSegment')).toBe('plumbing');
    expect(classifyIfcCategory('IfcLightFixture')).toBe('electrical');
    expect(classifyIfcCategory('IfcFan')).toBe('mechanical');
    expect(classifyIfcCategory('IfcBuildingStorey')).toBe('floors');
    expect(classifyIfcCategory('IfcBuilding')).toBe('buildings');
  });
});

describe('classifyIfcTypeName', () => {
  it('maps core IFC types to disciplines', () => {
    expect(classifyIfcTypeName('IfcWall')).toBe('architectural');
    expect(classifyIfcTypeName('IfcBeam')).toBe('structural');
    expect(classifyIfcTypeName('IfcSpace')).toBe('spaces');
    expect(classifyIfcTypeName('IfcPipeSegment')).toBe('plumbing');
    expect(classifyIfcTypeName('IfcLightFixture')).toBe('electrical');
    expect(classifyIfcTypeName('IfcFan')).toBe('mechanical');
    expect(classifyIfcTypeName('IfcCurtainWall')).toBe('exterior');
    expect(classifyIfcTypeName('IfcBuildingStorey')).toBe('floors');
    expect(classifyIfcTypeName('IfcBuilding')).toBe('building');
  });

  it('uses ObjectType hints', () => {
    expect(classifyIfcTypeName('IfcBuildingElementProxy', 'Exterior Cladding')).toBe('exterior');
    expect(classifyIfcTypeName('IfcSlab', 'FLOOR')).toBe('floors');
  });
});

describe('parseIfcSchemaFromHeader', () => {
  it('detects IFC4 and IFC2X3', () => {
    expect(parseIfcSchemaFromHeader("FILE_SCHEMA(('IFC4'));")).toBe('IFC4');
    expect(parseIfcSchemaFromHeader("FILE_SCHEMA(('IFC2X3'));")).toBe('IFC2X3');
    expect(parseIfcSchemaFromHeader("FILE_SCHEMA(('IFC4X3_ADD2'));")).toBe('IFC4X3_ADD2');
  });
});

describe('ifcAngleToDegrees', () => {
  it('converts compound angles', () => {
    expect(ifcAngleToDegrees([25, 30, 0])).toBeCloseTo(25.5, 4);
  });
});
