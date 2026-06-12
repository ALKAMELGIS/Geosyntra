import { describe, expect, it } from 'vitest';
import {
  describeShapefileUploadStaging,
  formatShapefileMissingMessage,
  groupShapefileParts,
  isShapefileSidecarUpload,
  isShpOnlyMultiPick,
  shapefileGeometryKindFromShpType,
  validateShapefileParts,
} from './shapefileImport';

function mockFile(name: string): File {
  return new File(['x'], name, { type: 'application/octet-stream' });
}

describe('groupShapefileParts', () => {
  it('groups sidecar files by basename', () => {
    const groups = groupShapefileParts([
      mockFile('parcels.shp'),
      mockFile('parcels.dbf'),
      mockFile('parcels.shx'),
      mockFile('parcels.prj'),
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get('parcels')).toMatchObject({
      shp: expect.any(File),
      dbf: expect.any(File),
      shx: expect.any(File),
      prj: expect.any(File),
    });
  });
});

describe('validateShapefileParts', () => {
  it('reports missing dbf and shx', () => {
    const issue = validateShapefileParts({ shp: mockFile('a.shp') }, 'a');
    expect(issue?.missing).toEqual(['dbf', 'shx']);
  });
});

describe('describeShapefileUploadStaging', () => {
  it('describes complete sidecar set', () => {
    const msg = describeShapefileUploadStaging([
      mockFile('roads.shp'),
      mockFile('roads.dbf'),
      mockFile('roads.shx'),
    ]);
    expect(msg).toContain('Shapefile');
    expect(msg).toContain('roads');
    expect(msg).toContain('Ready');
  });

  it('warns when dataset incomplete', () => {
    const msg = describeShapefileUploadStaging([mockFile('roads.shp'), mockFile('roads.dbf')]);
    expect(msg).toContain('Incomplete');
  });
});

describe('isShapefileSidecarUpload', () => {
  it('detects multi-file shapefile pick', () => {
    expect(isShapefileSidecarUpload([mockFile('a.shp'), mockFile('a.dbf')])).toBe(true);
    expect(isShapefileSidecarUpload([mockFile('a.zip')])).toBe(false);
  });
});

describe('formatShapefileMissingMessage', () => {
  it('lists required extensions', () => {
    const msg = formatShapefileMissingMessage([{ layerBase: 'test', missing: ['dbf', 'shx'] }]);
    expect(msg).toContain('.dbf');
    expect(msg).toContain('.shx');
  });
});

describe('shapefileGeometryKindFromShpType', () => {
  it('maps Esri shape types', () => {
    expect(shapefileGeometryKindFromShpType(1)).toBe('Point');
    expect(shapefileGeometryKindFromShpType(3)).toBe('Line');
    expect(shapefileGeometryKindFromShpType(5)).toBe('Polygon');
    expect(shapefileGeometryKindFromShpType(8)).toBe('MultiPoint');
  });
});

describe('isShpOnlyMultiPick', () => {
  it('detects multiple .shp without sidecars', () => {
    expect(isShpOnlyMultiPick([mockFile('a.shp'), mockFile('b.shp')])).toBe(true);
    expect(isShpOnlyMultiPick([mockFile('a.shp'), mockFile('a.dbf')])).toBe(false);
  });
});
