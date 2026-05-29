import './SiEnvLayerLiveOptions.css';

export type SiEnvLayerLiveRow = {
  id: string;
  label: string;
  meta?: string;
  visible: boolean;
  toggleable: boolean;
  onToggle: () => void;
};

export type SiEnvLayerLiveOptionsProps = {
  rows: SiEnvLayerLiveRow[];
  indexLayerId?: string;
  indexLayerOptions?: Array<{ id: string; label: string }>;
  onIndexLayerChange?: (id: string) => void;
  indexLayerSelectDisabled?: boolean;
  basemapId?: string;
  basemapOptions?: Array<{ id: string; label: string }>;
  onBasemapChange?: (id: string) => void;
};

export function SiEnvLayerLiveOptions({
  rows,
  indexLayerId = '',
  indexLayerOptions = [],
  onIndexLayerChange,
  indexLayerSelectDisabled = false,
  basemapId = '',
  basemapOptions = [],
  onBasemapChange,
}: SiEnvLayerLiveOptionsProps) {
  const showIndexPicker = indexLayerOptions.length > 0 && onIndexLayerChange;
  const showBasemapPicker = basemapOptions.length > 0 && onBasemapChange;

  return (
    <div className="si-env-layer-live-options" role="region" aria-label="Layer live options">
      <div className="si-env-chart-title">Layer live</div>
      <p className="si-env-layer-live-options__hint">
        Basemap and index raster controls. Map rendering is unchanged — only where you manage live layers moved here.
      </p>

      <ul className="si-env-layer-live-options__list">
        {rows.map(row => (
          <li key={row.id} className="si-env-layer-live-options__row">
            <div className="si-env-layer-live-options__main">
              <span className="si-env-layer-live-options__label" title={row.label}>
                {row.label}
              </span>
              {row.meta ? (
                <span className="si-env-layer-live-options__meta" title={row.meta}>
                  {row.meta}
                </span>
              ) : null}
            </div>
            {row.toggleable ? (
              <button
                type="button"
                className="si-env-layer-live-options__vis"
                title={row.visible ? 'Hide on map' : 'Show on map'}
                aria-label={row.visible ? `Hide ${row.label}` : `Show ${row.label}`}
                aria-pressed={row.visible}
                onClick={() => row.onToggle()}
              >
                <i className={`fa-solid ${row.visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
              </button>
            ) : (
              <span className="si-env-layer-live-options__badge">ON</span>
            )}
          </li>
        ))}
      </ul>

      {showBasemapPicker ? (
        <label className="si-env-layer-live-options__field">
          <span>Basemap style</span>
          <select
            value={basemapId}
            onChange={e => onBasemapChange(e.target.value)}
            aria-label="Basemap style"
          >
            {basemapOptions.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showIndexPicker ? (
        <label className="si-env-layer-live-options__field">
          <span>Active index layer</span>
          <select
            value={indexLayerId}
            disabled={indexLayerSelectDisabled}
            onChange={e => onIndexLayerChange(e.target.value)}
            aria-label="Active remote sensing index layer"
          >
            {indexLayerOptions.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
