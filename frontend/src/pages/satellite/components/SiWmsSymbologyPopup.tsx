import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { siStopsToVerticalCssGradient } from '../../../lib/siWmsIndexClassificationRamp';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_SYM_PRESET_STOPS,
  siSymbologyRampLabels,
  type SiSymbologyClassificationMode,
  type SiSymbologyRampPresetId,
  type SiWmsSymbologyUiState,
} from '../utils/siWmsSymbologyModel';
import { readMapCanvasLayout } from '../utils/siMapFloatingPanelLayout';
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
}: SiWmsSymbologyPopupProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const syncHostInsets = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const layout = readMapCanvasLayout();
    const pad = 16;
    host.style.setProperty('--si-map-trailing-dock', `${layout?.dockW ?? 0}px`);
    host.style.setProperty(
      '--si-map-leading-edge',
      layout ? `${layout.mapR.left + pad}px` : `${pad}px`,
    );
  }, []);

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

  useLayoutEffect(() => {
    if (!open) return;
    syncHostInsets();
  }, [open, syncHostInsets]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => syncHostInsets();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, syncHostInsets]);

  if (!open || typeof document === 'undefined') return null;

  const rampLabels = siSymbologyRampLabels();

  const body = (
    <div ref={hostRef} className="si-wms-sym-host" role="presentation">
      <div
        className="si-wms-sym-pop si-wms-sym-pop--dock-left"
        role="dialog"
        aria-modal="false"
        aria-labelledby="si-wms-sym-title"
      >
        <header className="si-wms-sym-pop__head">
          <div className="si-wms-sym-pop__titles">
            <h2 id="si-wms-sym-title">Symbology</h2>
            <p>Reclassify colors only — same index values; tiles refresh from Sentinel Hub.</p>
          </div>
          <button
            type="button"
            className="si-wms-sym-pop__close"
            title="Close"
            aria-label="Close symbology"
            onPointerDown={e => e.stopPropagation()}
            onClick={onClose}
          >
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

          <div className="si-wms-sym-field">
            <label id="si-wms-sym-palette-swatches">Palette colors</label>
            <p className="si-wms-sym-field-hint" id="si-wms-sym-palette-swatches-hint">
              Tap a swatch to apply that ramp (turns off Auto scientific).
            </p>
            <div
              className="si-wms-sym-ramp-swatches"
              role="group"
              aria-labelledby="si-wms-sym-palette-swatches"
              aria-describedby="si-wms-sym-palette-swatches-hint"
            >
              {rampLabels.map(r => {
                const stops = SI_SYM_PRESET_STOPS[r.id];
                const grad = stops.length >= 2 ? siStopsToVerticalCssGradient(stops) : '';
                const selected = !ui.autoScientific && ui.rampPreset === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={'si-wms-sym-ramp-swatch' + (selected ? ' si-wms-sym-ramp-swatch--active' : '')}
                    disabled={ui.autoScientific}
                    title={r.label}
                    aria-pressed={selected}
                    aria-label={r.label}
                    onClick={() => onUiChange({ rampPreset: r.id, autoScientific: false })}
                  >
                    <span className="si-wms-sym-ramp-swatch__bar" style={{ backgroundImage: grad }} aria-hidden />
                    <span className="si-wms-sym-ramp-swatch__cap">{r.label}</span>
                  </button>
                );
              })}
            </div>
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
    </div>
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
        className={
          'si-map-analysis-tool si-map-analysis-tool--sym-only' + (pressed ? ' si-map-analysis-tool--on' : '')
        }
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
