import type { UploadStagingDataset } from '../../../utils/uploadStagingModel';
import type { ShapefileGeometryKind } from '../../../utils/shapefileImport';
import { SiShapefileGeometryIcon, geometryKindLabel } from './SiShapefileGeometryIcon';
import './SiUploadStagedDatasets.css';

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 0.01 ? `${mb.toFixed(2)} MB` : '<0.01 MB';
}

function DatasetIcon({ ds }: { ds: UploadStagingDataset }) {
  if (ds.kind === 'shapefile') {
    const kind: ShapefileGeometryKind = ds.geometryKind ?? 'Unknown';
    return <SiShapefileGeometryIcon kind={kind} />;
  }
  if (ds.kind === 'vector') return <i className="fa-solid fa-draw-polygon" aria-hidden />;
  if (ds.kind === 'raster') return <i className="fa-solid fa-image" aria-hidden />;
  if (ds.kind === 'bim') return <i className="fa-solid fa-cubes" aria-hidden />;
  if (ds.kind === 'archive') return <i className="fa-solid fa-file-zipper" aria-hidden />;
  return <i className="fa-solid fa-file" aria-hidden />;
}

function formatLabel(ds: UploadStagingDataset): string {
  if (ds.kind === 'shapefile') {
    return geometryKindLabel(ds.geometryKind ?? 'Unknown');
  }
  return ds.formatLabel;
}

export function SiUploadStagedDatasets({
  datasets,
  onClear,
}: {
  datasets: UploadStagingDataset[];
  onClear: () => void;
}) {
  if (!datasets.length) return null;

  const allShapefile = datasets.every(d => d.kind === 'shapefile');
  const listTitle = allShapefile ? 'Shapefiles' : 'Datasets';

  return (
    <div className="si-upload-datasets">
      <div className="si-upload-datasets__head">
        <span className="si-upload-datasets__title">{listTitle}</span>
        <span className="si-upload-datasets__count">{datasets.length}</span>
      </div>
      <ul className="si-upload-dataset-list" aria-label="Staged GIS datasets">
        {datasets.map(ds => (
          <li key={ds.id}>
            <article
              className={`si-upload-dataset${ds.ready ? '' : ' si-upload-dataset--warn'}`}
              aria-label={`${formatLabel(ds)} ${ds.name}`}
            >
              <div className="si-upload-dataset__icon" aria-hidden>
                <DatasetIcon ds={ds} />
              </div>
              <div className="si-upload-dataset__body">
                <div className="si-upload-dataset__title-row">
                  <span className="si-upload-dataset__name">{ds.name}.shp</span>
                  <span className="si-upload-dataset__format">{formatLabel(ds)}</span>
                </div>
                <p className="si-upload-dataset__meta">
                  {formatSize(ds.sizeBytes)}
                  {ds.ready ? ' · Ready' : ` · ${ds.statusHint}`}
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <div className="si-upload-datasets__actions">
        <button type="button" className="si-upload-staged-clear" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
