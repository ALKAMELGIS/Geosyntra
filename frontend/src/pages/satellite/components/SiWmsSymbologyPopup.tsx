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
  const popRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const openCycleRef = useRef(0);

  const clampPopPosition = useCallback((left: number, top: number) => {
    const el = popRef.current;
    if (!el) return { left, top };
    const pad = 10;
    const w = el.offsetWidth || 360;
    const h = el.offsetHeight || 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minVisible = 48;
    const maxL = vw - minVisible;
    const maxT = vh - minVisible;
    return {
      left: Math.min(maxL, Math.max(pad, left)),
      top: Math.min(maxT, Math.max(pad, top)),
    };
  }, []);

  const placePopFixed = useCallback(
    (left: number, top: number) => {
      const el = popRef.current;
      if (!el) return;
      const { left: L, top: T } = clampPopPosition(left, top);
      el.style.left = `${L}px`;
      el.style.top = `${T}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    },
    [clampPopPosition],
  );

  /** Open anchored to the right (wide viewports) or horizontally centered (narrow), vertically centered. */
  const placeInitialPop = useCallback(() => {
    const el = popRef.current;
    if (!el) return;
    const pad = 16;
    const w = el.offsetWidth || 360;
    const h = el.offsetHeight || 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const useRight = vw >= 560;
    let left: number;
    if (useRight) {
      left = vw - pad - w;
    } else {
      left = (vw - w) / 2;
    }
    let top = (vh - h) / 2;
    top -= Math.min(28, vh * 0.03);
    placePopFixed(left, top);
  }, [placePopFixed]);

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
    const id = ++openCycleRef.current;
    const run = () => {
      if (!open || openCycleRef.current !== id) return;
      placeInitialPop();
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [open, placeInitialPop]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.si-wms-sym-pop__close')) return;
      const el = popRef.current;
      if (!el) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      el.classList.add('si-wms-sym-pop--dragging');

      const onMove = (ev: PointerEvent) => {
        placePopFixed(startLeft + (ev.clientX - startX), startTop + (ev.clientY - startY));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        popRef.current?.classList.remove('si-wms-sym-pop--dragging');
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [placePopFixed],
  );

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const el = popRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      placePopFixed(r.left, r.top);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, placePopFixed]);

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
        <header
          className="si-wms-sym-pop__head si-wms-sym-pop__head--draggable"
          onPointerDown={onHeaderPointerDown}
          title="Drag to move"
        >
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
