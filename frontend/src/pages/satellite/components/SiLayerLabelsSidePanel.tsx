import { useMemo } from 'react';
import { getGeoJsonFields } from '../symbologyHelpers';
import type { SiLayerLabelsDraft } from '../utils/siLayerLabelsEngine';
import './SiLayerLabelsSidePanel.css';

export type SiLayerLabelsSidePanelProps = {
  layerName: string;
  geojson: unknown;
  draft: SiLayerLabelsDraft;
  onDraftChange: (patch: Partial<SiLayerLabelsDraft>) => void;
  onReset: () => void;
  onClose: () => void;
  onApply: () => void;
  onDone: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
};

function toColorInputHex(raw: string | undefined, fallback: string): string {
  const h = (raw || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function SiLayerLabelsSidePanel({
  layerName,
  geojson,
  draft,
  onDraftChange,
  onReset,
  onClose,
  onApply,
  onDone,
  onHeaderPointerDown,
}: SiLayerLabelsSidePanelProps) {
  const fields = useMemo(() => getGeoJsonFields(geojson), [geojson]);
  const previewText = draft.field
    ? draft.field
    : fields.length
      ? 'Select field'
      : 'No fields';

  return (
    <div id="si-layer-action-title" className="si-lbl-side-panel" role="dialog" aria-modal="false">
      <header
        className="si-lbl-side-panel__head si-lbl-side-panel__head--drag"
        onPointerDown={onHeaderPointerDown}
        title="Drag to move"
      >
        <div className="si-lbl-side-panel__brand">
          <i className="fa-solid fa-tag" aria-hidden />
          <div className="si-lbl-side-panel__brand-text">
            <h2 className="si-lbl-side-panel__title">Labels</h2>
            <p className="si-lbl-side-panel__subtitle" title={layerName}>
              {layerName}
            </p>
          </div>
        </div>
        <button type="button" className="si-lbl-side-panel__close" onClick={onDone} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="si-lbl-side-panel__body">
        <label className="si-lbl-side-toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={e => onDraftChange({ enabled: e.target.checked })}
          />
          <span>Show on map</span>
        </label>

        <div className="si-lbl-side-preview" aria-live="polite">
          <span
            className="si-lbl-side-preview__chip"
            style={{
              color: draft.color,
              fontSize: Math.max(9, Math.min(16, draft.fontSize * 0.65)),
              fontWeight: draft.fontStyle?.includes('bold') ? 700 : 400,
              fontStyle: draft.fontStyle?.includes('italic') ? 'italic' : 'normal',
            }}
          >
            {previewText}
          </span>
        </div>

        <label className="si-lbl-side-field">
          <span className="si-lbl-side-field__label">Field</span>
          <select
            className="si-lbl-side-field__input"
            value={draft.field}
            disabled={!fields.length}
            onChange={e => onDraftChange({ field: e.target.value })}
          >
            {!fields.length ? <option value="">No fields</option> : null}
            {fields.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <div className="si-lbl-side-row-2">
          <label className="si-lbl-side-field si-lbl-side-field--grow">
            <span className="si-lbl-side-field__label">Size {draft.fontSize}px</span>
            <input
              type="range"
              min={8}
              max={28}
              step={1}
              value={draft.fontSize}
              onChange={e => onDraftChange({ fontSize: Number(e.target.value) })}
            />
          </label>
          <label className="si-lbl-side-field si-lbl-side-field--color">
            <span className="si-lbl-side-field__label">Color</span>
            <input
              type="color"
              className="si-lbl-side-field__color"
              value={toColorInputHex(draft.color, '#f8fafc')}
              onChange={e => onDraftChange({ color: e.target.value })}
            />
          </label>
        </div>

        <div className="si-lbl-side-row-2">
          <label className="si-lbl-side-field si-lbl-side-field--grow">
            <span className="si-lbl-side-field__label">Style</span>
            <select
              className="si-lbl-side-field__input"
              value={draft.fontStyle ?? 'regular'}
              onChange={e =>
                onDraftChange({
                  fontStyle: e.target.value as SiLayerLabelsDraft['fontStyle'],
                })
              }
            >
              <option value="regular">Regular</option>
              <option value="bold">Bold</option>
              <option value="italic">Italic</option>
              <option value="bold-italic">Bold italic</option>
            </select>
          </label>
          <fieldset className="si-lbl-side-field si-lbl-side-field--align">
            <legend className="si-lbl-side-field__label">Align</legend>
            <div className="si-lbl-side-align" role="group">
              {(['left', 'center', 'right'] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  className={'si-lbl-side-align__btn' + (draft.align === a ? ' si-lbl-side-align__btn--on' : '')}
                  title={a}
                  onClick={() => onDraftChange({ align: a })}
                >
                  {a[0]!.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="si-lbl-side-field">
          <span className="si-lbl-side-field__label">Opacity {Math.round((draft.opacity ?? 1) * 100)}%</span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round((draft.opacity ?? 0.96) * 100)}
            onChange={e => onDraftChange({ opacity: Number(e.target.value) / 100 })}
          />
        </label>

        <p className="si-lbl-side-hint">Changes preview on the map. Press Apply to save to the layer.</p>

        <button type="button" className="si-lbl-side-link" onClick={onReset}>
          Reset defaults
        </button>
      </div>
      <footer className="si-lbl-side-panel__foot">
        <button type="button" className="si-lbl-side-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="si-lbl-side-btn si-lbl-side-btn--primary" onClick={onApply}>
          Apply
        </button>
      </footer>
    </div>
  );
}
