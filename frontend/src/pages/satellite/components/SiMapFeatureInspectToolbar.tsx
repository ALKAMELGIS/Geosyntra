import './SiMapFeatureInspectToolbar.css';

export type SiMapIdentifyCandidate = {
  id: string;
  title: string;
};

export type SiMapFeatureInspectToolbarProps = {
  candidates: SiMapIdentifyCandidate[];
  activeCandidateId: string;
  onSelectCandidate: (id: string) => void;
  onEdit: () => void;
  onZoomTo: () => void;
  onOpenTable: () => void;
  editActive?: boolean;
  editDisabled?: boolean;
  zoomDisabled?: boolean;
  tableDisabled?: boolean;
  /** Compact rail for map-anchored luxury popup. */
  compact?: boolean;
};

export function SiMapFeatureInspectToolbar({
  candidates,
  activeCandidateId,
  onSelectCandidate,
  onEdit,
  onZoomTo,
  onOpenTable,
  editActive = false,
  editDisabled = false,
  zoomDisabled = false,
  tableDisabled = false,
  compact = false,
}: SiMapFeatureInspectToolbarProps) {
  const showLayerPicker = candidates.length > 1;

  return (
    <div
      className={
        'si-map-identify-toolbar' + (compact ? ' si-map-identify-toolbar--compact' : '')
      }
      role="toolbar"
      aria-label="Feature popup actions"
    >
      {showLayerPicker ? (
        <label className="si-map-identify-toolbar__layer-pick">
          <span className="si-map-identify-toolbar__layer-label">Layer</span>
          <select
            className="si-map-identify-toolbar__layer-select"
            value={activeCandidateId}
            aria-label="Select feature layer at this location"
            onClick={e => e.stopPropagation()}
            onChange={e => onSelectCandidate(e.target.value)}
          >
            {candidates.map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="gis-map-popup-toolbar si-map-identify-toolbar__actions" role="presentation">
        <button
          type="button"
          className={'gis-map-popup-toolbtn' + (editActive ? ' gis-map-popup-toolbtn--on' : '')}
          title="Edit attributes"
          aria-label="Edit attributes"
          aria-pressed={editActive}
          disabled={editDisabled}
          onClick={e => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <i className="fa-solid fa-pen" aria-hidden />
          <span>Edit</span>
        </button>
        <span className="gis-map-popup-toolsep" aria-hidden />
        <button
          type="button"
          className="gis-map-popup-toolbtn"
          title="Zoom to feature"
          aria-label="Zoom to feature"
          disabled={zoomDisabled}
          onClick={e => {
            e.stopPropagation();
            onZoomTo();
          }}
        >
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
          <span>Zoom to</span>
        </button>
        <span className="gis-map-popup-toolsep" aria-hidden />
        <button
          type="button"
          className="gis-map-popup-toolbtn"
          title="Open layer attribute table"
          aria-label="Open layer attribute table"
          disabled={tableDisabled}
          onClick={e => {
            e.stopPropagation();
            onOpenTable();
          }}
        >
          <i className="fa-solid fa-table" aria-hidden />
          <span>Table</span>
        </button>
      </div>
    </div>
  );
}
