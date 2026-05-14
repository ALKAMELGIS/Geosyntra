import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { siStopsToVerticalCssGradient } from '../../../lib/siWmsIndexClassificationRamp';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_WMS_SYMBOLOGY_DEFAULT_UI,
  siSymbologyRampLabels,
  type SiSymbologyClassificationMode,
  type SiSymbologyRampPresetId,
  type SiWmsSymbologyUiState,
} from '../utils/siWmsSymbologyModel';
import './SiWmsSymbologyPopup.css';

export type SiWmsSymbologyLayerOption = { id: string; label: string };

export type SiWmsSymbologyPopupProps = {
  open: boolean;
  onClose: () => void;
  layerOptions: SiWmsSymbologyLayerOption[];
  targetLayerId: string;
  onTargetLayerId: (id: string) => void;
  ui: SiWmsSymbologyUiState;
  onUiChange: (patch: Partial<SiWmsSymbologyUiState>) => void;
  previewStops: readonly IndexRampStop[] | null;
  onResetLayer: () => void;
  anchor?: 'toolbar-embedded' | 'map-dock';
};

export function SiWmsSymbologyPopup({
  open,
  onClose,
  layerOptions,
  targetLayerId,
  onTargetLayerId,
  ui,
  onUiChange,
  previewStops,
  onResetLayer,
  anchor = 'toolbar-embedded',
}: SiWmsSymbologyPopupProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);

  const gradient = useMemo(
    () => (previewStops && previewStops.length >= 2 ? siStopsToVerticalCssGradient(previewStops) : ''),
    [previewStops],
  );

  const onDocKey = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [onDocKey]);

  useEffect(() => {
    if (!open) return;
    const pop = popRef.current;
    if (!pop) return;
    const pad = 16;
    const w = pop.offsetWidth || 360;
    const h = pop.offsetHeight || 400;
    if (anchor === 'map-dock') {
      pop.style.right = `${pad}px`;
      pop.style.bottom = `${pad + 52}px`;
      pop.style.left = 'auto';
      pop.style.top = 'auto';
      return;
    }
    const host = document.querySelector('.si-map-analysis-toolbar--embedded') as HTMLElement | null;
    if (host) {
      const r = host.getBoundingClientRect();
      let left = r.right - w - 4;
      let top = r.bottom + 8;
      if (left < pad) left = pad;
      if (left + w > window.innerWidth - pad) left = window.innerWidth - pad - w;
      if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 8);
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.style.right = 'auto';
      pop.style.bottom = 'auto';
    } else {
      pop.style.right = `${pad}px`;
      pop.style.bottom = `${pad + 72}px`;
      pop.style.left = 'auto';
      pop.style.top = 'auto';
    }
  }, [open, anchor, layerOptions.length, ui.numClasses, ui.opacity01, targetLayerId]);

  if (!open || typeof document === 'undefined') return null;

  const rampLabels = siSymbologyRampLabels();

  const body = (
    <>
      <div
        ref={scrimRef}
        className="si-wms-sym-scrim"
        onMouseDown={e => {
          if (e.target === scrimRef.current) onClose();
        }}
        aria-hidden
      />
      <div
        ref={popRef}
        className="si-wms-sym-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="si-wms-sym-title"
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="si-wms-sym-pop__head">
          <div className="si-wms-sym-pop__titles">
            <h2 id="si-wms-sym-title">Symbology</h2>
            <p>Reclassify colors only — same index values; tiles refresh from Sentinel Hub.</p>
          </div>
          <button type="button" className="si-wms-sym-pop__close" title="Close" aria-label="Close symbology" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="si-wms-sym-pop__body">
          <div className="si-wms-sym-field">
            <label htmlFor="si-wms-sym-layer">Layer</label>
            <select
              id="si-wms-sym-layer"
              value={targetLayerId}
              onChange={e => onTargetLayerId(e.target.value)}
              aria-label="WMS layer for symbology"
            >
              {layerOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="si-wms-sym-field">
            <label htmlFor="si-wms-sym-ramp">Color scheme</label>
            <select
              id="si-wms-sym-ramp"
              value={ui.rampPreset}
              disabled={ui.autoScientific}
              onChange={e => onUiChange({ rampPreset: e.target.value as SiSymbologyRampPresetId, autoScientific: false })}
              aria-label="Color scheme preset"
            >
              {rampLabels.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="si-wms-sym-row">
            <span>Auto scientific</span>
            <input
              type="checkbox"
              checked={ui.autoScientific}
              onChange={e => onUiChange({ autoScientific: e.target.checked })}
              aria-label="Auto pick color scheme from layer type"
            />
          </div>

          <div className="si-wms-sym-field">
            <label>Classification</label>
            <div className="si-wms-sym-seg" role="group" aria-label="Classification type">
              {(
                [
                  ['quantitative', 'Quantitative'],
                  ['qualitative', 'Qualitative'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={ui.classificationType === id ? 'si-wms-sym-seg--on' : ''}
                  aria-pressed={ui.classificationType === id}
                  onClick={() => onUiChange({ classificationType: id as SiSymbologyClassificationMode })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="si-wms-sym-field">
            <label htmlFor="si-wms-sym-classes">Number of classes ({ui.numClasses})</label>
            <input
              id="si-wms-sym-classes"
              type="range"
              min={3}
              max={14}
              step={1}
              value={ui.numClasses}
              onChange={e => onUiChange({ numClasses: Number(e.target.value) })}
              aria-valuemin={3}
              aria-valuemax={14}
              aria-valuenow={ui.numClasses}
            />
          </div>

          <div className="si-wms-sym-field">
            <label htmlFor="si-wms-sym-op">Opacity ({Math.round(ui.opacity01 * 100)}%)</label>
            <input
              id="si-wms-sym-op"
              type="range"
              min={0.15}
              max={1}
              step={0.01}
              value={ui.opacity01}
              onChange={e => onUiChange({ opacity01: Number(e.target.value) })}
            />
          </div>

          <div className="si-wms-sym-preview">
            <div className="si-wms-sym-preview__k">Live preview</div>
            {gradient ? (
              <div className="si-wms-sym-preview__bar" style={{ backgroundImage: gradient }} aria-hidden />
            ) : (
              <div className="si-wms-sym-preview__empty">Select a classified index layer</div>
            )}
          </div>
        </div>

        <footer className="si-wms-sym-foot">
          <button type="button" className="si-wms-sym-btn si-wms-sym-btn--ghost" onClick={onResetLayer}>
            Reset layer
          </button>
          <button type="button" className="si-wms-sym-btn si-wms-sym-btn--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </>
  );

  return createPortal(body, document.body);
}

export function SiWmsSymbologyToolbarIconButton(props: {
  pressed: boolean;
  title?: string;
  onClick: () => void;
  /** Match Remote Sensing embedded drawing toolbar (`si-map-analysis-tool`). */
  variant?: 'default' | 'embedded';
  disabled?: boolean;
}) {
  const { pressed, onClick, title = 'Symbology — classified colors', variant = 'default', disabled = false } = props;
  if (variant === 'embedded') {
    return (
      <button
        type="button"
        className={'si-map-analysis-tool' + (pressed ? ' si-map-analysis-tool--on' : '')}
        title={title}
        aria-pressed={pressed}
        aria-label="Open symbology"
        disabled={disabled}
        onClick={onClick}
      >
        <i className="fa-solid fa-palette" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={'si-wms-sym-toolbar-btn' + (pressed ? ' si-wms-sym-toolbar-btn--on' : '')}
      title={title}
      aria-pressed={pressed}
      aria-label="Open symbology"
      disabled={disabled}
      onClick={onClick}
    >
      <i className="fa-solid fa-palette" aria-hidden />
    </button>
  );
}
