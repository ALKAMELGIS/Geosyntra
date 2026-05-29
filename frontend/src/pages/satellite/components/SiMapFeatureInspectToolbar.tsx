import './SiMapFeatureInspectToolbar.css';

export type SiMapIdentifyCandidate = {
  id: string;
  title: string;
};

export type SiMapFeatureInspectToolbarProps = {
  candidates: SiMapIdentifyCandidate[];
  activeCandidateId: string;
  onSelectCandidate: (id: string) => void;
  onZoomTo: () => void;
  onHighlight: () => void;
  onCopyCoordinates: () => void;
  onOpenDetails: () => void;
  highlightActive?: boolean;
  copyLabel?: string;
};

export function SiMapFeatureInspectToolbar({
  candidates,
  activeCandidateId,
  onSelectCandidate,
  onZoomTo,
  onHighlight,
  onCopyCoordinates,
  onOpenDetails,
  highlightActive = false,
  copyLabel = 'Copied',
}: SiMapFeatureInspectToolbarProps) {
  const showLayerPicker = candidates.length > 1;

  return (
    <div className="si-map-identify-toolbar" role="toolbar" aria-label="Feature popup actions">
      {showLayerPicker ? (
        <label className="si-map-identify-toolbar__layer-pick">
          <span className="si-map-identify-toolbar__layer-label">Layer</span>
          <select
            className="si-map-identify-toolbar__layer-select"
            value={activeCandidateId}
            aria-label="Select feature layer at this location"
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
      <div className="si-map-identify-toolbar__actions">
        <button type="button" className="si-map-identify-toolbar__btn" title="Zoom to feature" onClick={onZoomTo}>
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
          <span>Zoom</span>
        </button>
        <button
          type="button"
          className={`si-map-identify-toolbar__btn${highlightActive ? ' si-map-identify-toolbar__btn--on' : ''}`}
          title="Highlight on map"
          onClick={onHighlight}
        >
          <i className="fa-solid fa-highlighter" aria-hidden />
          <span>Highlight</span>
        </button>
        <button type="button" className="si-map-identify-toolbar__btn" title="Copy coordinates" onClick={onCopyCoordinates}>
          <i className="fa-solid fa-copy" aria-hidden />
          <span>{copyLabel}</span>
        </button>
        <button type="button" className="si-map-identify-toolbar__btn" title="Open attribute table" onClick={onOpenDetails}>
          <i className="fa-solid fa-table" aria-hidden />
          <span>Details</span>
        </button>
      </div>
    </div>
  );
}
