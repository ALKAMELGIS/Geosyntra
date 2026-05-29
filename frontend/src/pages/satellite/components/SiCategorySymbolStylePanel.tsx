import { useId, useState } from 'react';
import type { SymbologyCategoryStyle } from '../layerTypes';
import { SiSymbologyColorField } from './SiSymbologyColorField';
import './SiCategorySymbolStylePanel.css';

export type SiCategorySymbolStylePanelProps = {
  categoryLabel: string;
  style: SymbologyCategoryStyle;
  geometryKind?: 'polygon' | 'line' | 'point';
  previewCornerRadius?: number;
  onChange: (next: SymbologyCategoryStyle) => void;
  onClose: () => void;
  /** Hide header when hosted inside floating chrome */
  embedded?: boolean;
};

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="si-cat-symbol-panel__slider-field">
      <label className="si-cat-symbol-panel__slider-label" htmlFor={id}>
        {label}
      </label>
      <div className="si-cat-symbol-panel__slider-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--si-slider-pct': `${pct}%` } as React.CSSProperties}
          onChange={e => onChange(Number(e.target.value))}
        />
        <div className="si-cat-symbol-panel__numwrap">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number(value.toFixed(step < 1 ? 2 : 0))}
            onChange={e => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
            }}
          />
          <span className="si-cat-symbol-panel__unit">{unit}</span>
        </div>
      </div>
    </div>
  );
}

export function SiCategorySymbolStylePanel({
  categoryLabel,
  style,
  geometryKind = 'polygon',
  previewCornerRadius = 8,
  onChange,
  onClose,
  embedded = false,
}: SiCategorySymbolStylePanelProps) {
  const [strokeOpen, setStrokeOpen] = useState(true);
  const [fillOpen, setFillOpen] = useState(true);
  const rx = Math.min(8, Math.max(0, previewCornerRadius));
  const isPoint = geometryKind === 'point';
  const isLine = geometryKind === 'line';
  const typeLabel = isPoint ? 'Vector point' : isLine ? 'Vector line' : 'Vector polygon';
  const markerR = style.markerSize ?? 6;
  const rot = style.rotation ?? 0;

  const patch = (p: Partial<SymbologyCategoryStyle>) => onChange({ ...style, ...p });

  return (
    <aside
      className={`si-cat-symbol-panel${embedded ? ' si-cat-symbol-panel--embedded' : ''}`}
      role="dialog"
      aria-label={`Symbol style — ${categoryLabel}`}
    >
      {!embedded ? (
        <header className="si-cat-symbol-panel__header">
          <h3 className="si-cat-symbol-panel__title">Symbol style</h3>
          <button type="button" className="si-cat-symbol-panel__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>
      ) : null}

      <div className="si-cat-symbol-panel__symbol-row">
        <div className="si-cat-symbol-panel__symbol-preview" aria-hidden>
          {isPoint ? (
            <svg width="56" height="40" viewBox="0 0 56 40">
              <g transform={`rotate(${rot} 28 20)`}>
                <circle
                  cx="28"
                  cy="20"
                  r={Math.min(14, markerR * 1.2)}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.outline}
                  strokeOpacity={style.outlineOpacity}
                  strokeWidth={Math.max(1, style.outlineWidth)}
                />
              </g>
            </svg>
          ) : isLine ? (
            <svg width="56" height="40" viewBox="0 0 56 40">
              <line
                x1="8"
                y1="28"
                x2="48"
                y2="12"
                stroke={style.outline}
                strokeOpacity={style.outlineOpacity}
                strokeWidth={Math.max(1, style.outlineWidth * 1.4)}
                strokeDasharray={
                  style.lineDash === 'dashed'
                    ? '6 4'
                    : style.lineDash === 'dotted'
                      ? '2 3'
                      : style.lineDash === 'dashdot'
                        ? '8 3 2 3'
                        : undefined
                }
              />
            </svg>
          ) : (
            <svg width="56" height="40" viewBox="0 0 56 40">
              <rect
                x="10"
                y="8"
                width="36"
                height="24"
                rx={rx}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={style.outline}
                strokeOpacity={style.outlineOpacity}
                strokeWidth={Math.max(1, style.outlineWidth * 1.4)}
              />
            </svg>
          )}
        </div>
        <div className="si-cat-symbol-panel__symbol-meta">
          <span className="si-cat-symbol-panel__symbol-type">{typeLabel}</span>
          <span className="si-cat-symbol-panel__symbol-cat" title={categoryLabel}>
            {categoryLabel}
          </span>
        </div>
      </div>

      {isPoint ? (
        <>
          <SliderField
            label="Marker size"
            value={markerR}
            min={2}
            max={24}
            step={0.5}
            unit="px"
            onChange={markerSize => patch({ markerSize })}
          />
          <SliderField
            label="Rotation"
            value={rot}
            min={0}
            max={360}
            step={1}
            unit="°"
            onChange={rotation => patch({ rotation })}
          />
        </>
      ) : null}

      {isLine ? (
        <div className="si-cat-symbol-panel__field">
          <label className="si-cat-symbol-panel__slider-label" htmlFor="si-cat-line-dash">
            Line style
          </label>
          <select
            id="si-cat-line-dash"
            className="si-cat-symbol-panel__select"
            value={style.lineDash ?? 'solid'}
            onChange={e => patch({ lineDash: e.target.value as SymbologyCategoryStyle['lineDash'] })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="dashdot">Dash dot</option>
          </select>
        </div>
      ) : null}

      <SliderField
        label="Outline width"
        value={style.outlineWidth}
        min={0.25}
        max={8}
        step={0.05}
        unit="px"
        onChange={outlineWidth => patch({ outlineWidth })}
      />

      <div className="si-cat-symbol-panel__section">
        <button
          type="button"
          className="si-cat-symbol-panel__section-head"
          onClick={() => setStrokeOpen(o => !o)}
          aria-expanded={strokeOpen}
        >
          <i className={`fa-solid fa-chevron-${strokeOpen ? 'up' : 'down'}`} aria-hidden />
          <span className="si-cat-symbol-panel__section-icon si-cat-symbol-panel__section-icon--stroke" aria-hidden />
          <span>Solid stroke</span>
        </button>
        {strokeOpen ? (
          <div className="si-cat-symbol-panel__section-body">
            <SiSymbologyColorField
              label="Color"
              value={style.outline}
              presetRole="stroke"
              showPresets
              onChange={outline => patch({ outline })}
            />
            <SliderField
              label="Transparency"
              value={Math.round((1 - style.outlineOpacity) * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={pct => patch({ outlineOpacity: Math.max(0, Math.min(1, 1 - pct / 100)) })}
            />
            <SliderField
              label="Width"
              value={style.outlineWidth}
              min={0.25}
              max={8}
              step={0.05}
              unit="px"
              onChange={outlineWidth => patch({ outlineWidth })}
            />
          </div>
        ) : null}
      </div>

      {!isLine ? (
      <div className="si-cat-symbol-panel__section">
        <button
          type="button"
          className="si-cat-symbol-panel__section-head"
          onClick={() => setFillOpen(o => !o)}
          aria-expanded={fillOpen}
        >
          <i className={`fa-solid fa-chevron-${fillOpen ? 'up' : 'down'}`} aria-hidden />
          <span
            className="si-cat-symbol-panel__section-icon si-cat-symbol-panel__section-icon--fill"
            style={{ background: style.fill }}
            aria-hidden
          />
          <span>Solid fill</span>
        </button>
        {fillOpen ? (
          <div className="si-cat-symbol-panel__section-body">
            <SiSymbologyColorField
              label="Fill color"
              value={style.fill}
              presetRole="fill"
              showPresets
              onChange={fill => patch({ fill })}
            />
            <SliderField
              label="Fill transparency"
              value={Math.round((1 - style.fillOpacity) * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={pct => patch({ fillOpacity: Math.max(0, Math.min(1, 1 - pct / 100)) })}
            />
          </div>
        ) : null}
      </div>
      ) : null}
    </aside>
  );
}
