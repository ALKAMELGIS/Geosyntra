import { describe, expect, it } from 'vitest';
import {
  allUploadDatasetsReady,
  buildUploadStagingDatasets,
  describeUploadStagingDatasets,
  GIS_UPLOAD_ACCEPT,
} from './uploadStagingModel';

function mockFile(name: string): File {
  return new File(['x'], name, { type: 'application/octet-stream' });
}

describe('buildUploadStagingDatasets', () => {
  it('collapses shapefile sidecars into one dataset card', () => {
    const datasets = buildUploadStagingDatasets([
      mockFile('landcovers.shp'),
      mockFile('landcovers.dbf'),
      mockFile('landcovers.shx'),
      mockFile('landcovers.prj'),
    ]);
    expect(datasets).toHaveLength(1);
    expect(datasets[0]).toMatchObject({
      name: 'landcovers',
      kind: 'shapefile',
      formatLabel: 'Shapefile',
      ready: true,
    });
    expect(datasets[0]!.files).toHaveLength(4);
  });

  it('groups multiple shapefiles from a folder drop', () => {
    const datasets = buildUploadStagingDatasets([
      mockFile('a.shp'),
      mockFile('a.dbf'),
      mockFile('a.shx'),
      mockFile('b.shp'),
      mockFile('b.dbf'),
      mockFile('b.shx'),
    ]);
    expect(datasets).toHaveLength(2);
    expect(datasets.map(d => d.name).sort()).toEqual(['a', 'b']);
  });

  it('marks .shp-only pick as incomplete dataset', () => {
    const datasets = buildUploadStagingDatasets([mockFile('roads.shp')]);
    expect(datasets).toHaveLength(1);
    expect(datasets[0]!.ready).toBe(false);
    expect(datasets[0]!.name).toBe('roads');
  });

  it('does not expose sidecar filenames in dataset name', () => {
    const datasets = buildUploadStagingDatasets([
      mockFile('hydro.shp'),
      mockFile('hydro.dbf'),
      mockFile('hydro.shx'),
    ]);
    expect(datasets[0]!.name).toBe('hydro');
    expect(datasets[0]!.name).not.toContain('.dbf');
  });
});

describe('describeUploadStagingDatasets', () => {
  it('uses dataset wording not file parts', () => {
    const msg = describeUploadStagingDatasets(
      buildUploadStagingDatasets([mockFile('roads.shp'), mockFile('roads.dbf'), mockFile('roads.shx')]),
    );
    expect(msg).toContain('Shapefile');
    expect(msg).toContain('roads');
    expect(msg).not.toContain('shapefile parts');
  });
});

describe('allUploadDatasetsReady', () => {
  it('requires every dataset to be ready', () => {
    const datasets = buildUploadStagingDatasets([mockFile('x.shp')]);
    expect(allUploadDatasetsReady(datasets)).toBe(false);
  });
});

describe('GIS_UPLOAD_ACCEPT', () => {
  it('includes shapefile sidecar extensions for PC file picker', () => {
    expect(GIS_UPLOAD_ACCEPT).toContain('.shp');
    expect(GIS_UPLOAD_ACCEPT).toContain('.dbf');
    expect(GIS_UPLOAD_ACCEPT).toContain('.shx');
    expect(GIS_UPLOAD_ACCEPT).toContain('.prj');
  });
});
