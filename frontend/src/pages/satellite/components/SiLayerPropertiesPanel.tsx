import { useMemo } from 'react';
import { buildSiLayerPropertiesSections, type SiLayerPropertiesInput } from '../utils/siLayerPropertiesModel';
import './SiLayerPropertiesPanel.css';

export type SiLayerPropertiesPanelProps = {
  layer: SiLayerPropertiesInput;
  onClose: () => void;
  onZoomToLayer?: () => void;
};

export function SiLayerPropertiesPanel({ layer, onClose, onZoomToLayer }: SiLayerPropertiesPanelProps) {
  const sections = useMemo(() => buildSiLayerPropertiesSections(layer), [layer]);

  return (
    <div className="si-layer-props" role="document">
      <header className="si-layer-props__head">
        <div className="si-layer-props__brand">
          <i className="fa-solid fa-circle-info" aria-hidden />
          <div>
            <h2 id="si-layer-action-title" className="si-layer-props__title">
              Layer properties
            </h2>
            <p className="si-layer-props__subtitle" title={layer.name}>
              {layer.name}
            </p>
          </div>
        </div>
        <button type="button" className="si-layer-props__close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <p className="si-layer-props__purpose">
        Quick layer information and metadata overview — source, extent, feature count, CRS, and current settings.
      </p>

      <div className="si-layer-props__body">
        {sections.map(section => (
          <section key={section.title} className="si-layer-props__section">
            <h3 className="si-layer-props__section-title">{section.title}</h3>
            <dl className="si-layer-props__grid">
              {section.rows.map(row => (
                <div key={`${section.title}-${row.label}`} className="si-layer-props__row">
                  <dt>{row.label}</dt>
                  <dd className={row.mono ? 'si-layer-props__value--mono' : undefined} title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <footer className="si-layer-props__foot">
        {onZoomToLayer ? (
          <button type="button" className="si-layer-props__btn" onClick={onZoomToLayer}>
            <i className="fa-solid fa-magnifying-glass-location" aria-hidden />
            Zoom to layer
          </button>
        ) : null}
        <button type="button" className="si-layer-props__btn si-layer-props__btn--primary" onClick={onClose}>
          Close
        </button>
      </footer>
    </div>
  );
}
