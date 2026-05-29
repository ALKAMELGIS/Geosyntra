import type { SymbologyColorRamp } from '../layerTypes';
import { SI_SYMBOLOGY_RAMP_OPTIONS } from './siSymbologyStudioConstants';
import './SiSymbologyRampField.css';

export type SiSymbologyRampFieldProps = {
  label?: string;
  value: SymbologyColorRamp;
  stops: string[];
  onChange: (ramp: SymbologyColorRamp) => void;
};

export function SiSymbologyRampField({ label = 'Color ramp', value, stops, onChange }: SiSymbologyRampFieldProps) {
  const gradient = stops.length >= 2 ? `linear-gradient(90deg, ${stops.join(', ')})` : stops[0] ?? '#64748b';

  return (
    <div className="si-sym-ramp-field">
      <span className="si-sym-ramp-field__label">{label}</span>
      <div
        className="si-sym-ramp-field__preview"
        style={{ background: gradient }}
        role="img"
        aria-label={`${label} preview`}
      />
      <div className="gis-style-selectwrap">
        <select className="gis-style-select" value={value} onChange={e => onChange(e.target.value as SymbologyColorRamp)}>
          {SI_SYMBOLOGY_RAMP_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <i className="fa-solid fa-chevron-down" aria-hidden />
      </div>
    </div>
  );
}
