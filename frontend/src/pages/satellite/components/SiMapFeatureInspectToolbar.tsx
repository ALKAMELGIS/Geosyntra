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
  onOpenDetails: () => void;
  highlightActive?: boolean;
  /** Compact icon rail for map-anchored luxury popup. */
  compact?: boolean;
};

export function SiMapFeatureInspectToolbar({
  candidates,
  activeCandidateId,
  onSelectCandidate,
  onZoomTo,
  onHighlight,
  onOpenDetails,
  highlightActive = false,
  compact = false,
}: SiMapFeatureInspectToolbarProps) {
  const showLayerPicker = candidates.length > 1;
  const rootClass = compact
    ? 'si-map-identify-toolbar si-map-identify-toolbar--compact'
    : 'si-map-identify-toolbar';

  return (
    <div className={rootClass} role="toolbar" aria-label="Feature popup actions">
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
        <button
          type="button"
          className="si-map-identify-toolbar__btn"
          title="Zoom to feature"
          aria-label="Zoom to feature"
          onClick={onZoomTo}
        >
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
          {compact ? null : <span>Zoom</span>}
        </button>
        <button
          type="button"
          className={`si-map-identify-toolbar__btn${highlightActive ? ' si-map-identify-toolbar__btn--on' : ''}`}
          title="Highlight on map"
          aria-label="Highlight on map"
          onClick={onHighlight}
        >
          <i className="fa-solid fa-highlighter" aria-hidden />
          {compact ? null : <span>Highlight</span>}
        </button>
        <button
          type="button"
          className="si-map-identify-toolbar__btn"
          title="Open attribute table"
          aria-label="Open attribute table"
          onClick={onOpenDetails}
        >
          <i className="fa-solid fa-table" aria-hidden />
          {compact ? null : <span>Details</span>}
        </button>
      </div>
    </div>
  );
}
