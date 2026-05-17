import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  SATELLITE_PROVIDERS,
  getSatelliteProvider,
  type SatelliteProviderId,
} from '../utils/satellite/provider-capabilities';

export type SiSatelliteProviderSelectProps = {
  value: SatelliteProviderId;
  onChange: (id: SatelliteProviderId) => void;
};

export function SiSatelliteProviderSelect({ value, onChange }: SiSatelliteProviderSelectProps) {
  const autoId = useId();
  const triggerId = `si-sat-provider-${autoId}`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = getSatelliteProvider(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = useCallback(
    (id: SatelliteProviderId) => {
      onChange(id);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={rootRef} className="si-sat-provider-dd">
      <div className="si-field-analysis-kicker si-field-analysis-kicker--provider">Satellite provider</div>
      <button
        id={triggerId}
        type="button"
        className={`si-sat-provider-dd__trigger${open ? ' si-sat-provider-dd__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
      >
        <span className="si-sat-provider-dd__trigger-main">
          <span className="si-sat-provider-dd__icon" aria-hidden>
            {selected.icon}
          </span>
          <span className="si-sat-provider-dd__trigger-text">
            <span className="si-sat-provider-dd__name">{selected.name}</span>
            <span className="si-sat-provider-dd__meta">
              {selected.resolutionLabel} resolution · {selected.dataType}
            </span>
          </span>
        </span>
        <i className={`fa-solid fa-chevron-down si-sat-provider-dd__chev${open ? ' si-sat-provider-dd__chev--open' : ''}`} aria-hidden />
      </button>

      {open ? (
        <div className="si-sat-provider-dd__panel" role="listbox" aria-label="Satellite providers">
          {SATELLITE_PROVIDERS.map(p => {
            const active = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`si-sat-provider-dd__opt${active ? ' si-sat-provider-dd__opt--on' : ''}`}
                onClick={() => pick(p.id)}
              >
                <span className="si-sat-provider-dd__icon" aria-hidden>
                  {p.icon}
                </span>
                <span className="si-sat-provider-dd__opt-body">
                  <span className="si-sat-provider-dd__name">{p.name}</span>
                  <span className="si-sat-provider-dd__meta">
                    {p.resolutionLabel} resolution — {p.dataType}
                  </span>
                  <span className="si-sat-provider-dd__revisit">Revisit {p.revisitLabel}</span>
                </span>
                {active ? <i className="fa-solid fa-check si-sat-provider-dd__check" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
