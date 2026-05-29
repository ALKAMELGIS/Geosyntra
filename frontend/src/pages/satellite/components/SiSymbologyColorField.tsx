import { useId, useRef } from 'react';
import { SI_SYM_LUXURY_COLOR_PRESETS, normalizeSymbologyHexForInput } from './siSymbologyStudioConstants';
import './SiSymbologyColorField.css';

export type SiSymbologyColorFieldProps = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  fallback?: string;
  showPresets?: boolean;
  presetRole?: 'stroke' | 'fill';
};

export function SiSymbologyColorField({
  label,
  value,
  onChange,
  fallback = '#64748b',
  showPresets = false,
  presetRole = 'fill',
}: SiSymbologyColorFieldProps) {
  const inputId = useId();
  const nativeRef = useRef<HTMLInputElement>(null);
  const hex = normalizeSymbologyHexForInput(value, fallback);

  const applyPreset = (stroke: string, fill: string) => {
    onChange(presetRole === 'stroke' ? stroke : fill);
  };

  return (
    <div className="si-sym-color-field">
      <span className="si-sym-color-field__label">{label}</span>
      <div className="si-sym-color-field__row">
        <button
          type="button"
          className="si-sym-color-field__swatch"
          style={{ '--si-sym-swatch': hex } as React.CSSProperties}
          onClick={() => nativeRef.current?.click()}
          aria-label={`${label}: ${hex}`}
          title={hex}
        />
        <input
          ref={nativeRef}
          id={inputId}
          className="si-sym-color-field__native"
          type="color"
          value={hex}
          onChange={e => onChange(normalizeSymbologyHexForInput(e.target.value, fallback))}
          tabIndex={-1}
          aria-hidden
        />
        <input
          className="si-sym-color-field__hex"
          type="text"
          value={hex}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} hex`}
          onChange={e => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.length === 7 ? normalizeSymbologyHexForInput(v, fallback) : v);
          }}
          onBlur={e => onChange(normalizeSymbologyHexForInput(e.target.value, fallback))}
        />
      </div>
      {showPresets ? (
        <div className="si-sym-color-field__presets" role="list" aria-label={`${label} presets`}>
          {SI_SYM_LUXURY_COLOR_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className="si-sym-color-field__preset"
              role="listitem"
              title={p.label}
              style={
                {
                  '--si-sym-preset': presetRole === 'stroke' ? p.stroke : p.fill,
                } as React.CSSProperties
              }
              onClick={() => applyPreset(p.stroke, p.fill)}
              aria-label={`${p.label} preset`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
