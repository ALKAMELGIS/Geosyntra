import { useId, useRef, useState } from 'react';
import type { SymbologyCategoryStyle } from '../layerTypes';
import { siMapOutlineWidthPreviewPx } from '../utils/siMapOutlineWidthZoom';
import { normalizeSymbologyHexForInput } from './siSymbologyStudioConstants';
import { SiSymbologyLightSelect } from './SiSymbologyLightSelect';
import './SiCategorySymbolStylePanel.css';

function symOutlinePreviewPx(width: number, mapZoom?: number, scale = 1) {
  return siMapOutlineWidthPreviewPx((width ?? 1) * scale, mapZoom);
}

const LINE_DASH_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashdot', label: 'Dash dot' },
] as const;

export type SiCategorySymbolStylePanelProps = {
  categoryLabel: string;
  style: SymbologyCategoryStyle;
  geometryKind?: 'polygon' | 'line' | 'point';
  previewCornerRadius?: number;
  /** Current map zoom — scales outline previews to match on-map strokes. */
  mapZoom?: number;
  onChange: (next: SymbologyCategoryStyle) => void;
  onClose: () => void;
  /** Hide header when hosted inside floating chrome */
  embedded?: boolean;
};

const STROKE_COLOR_PRESETS = ['#334155', '#0a0a0a', '#7c3aed'];
const FILL_COLOR_PRESETS = ['#84cc16', '#4d7c0f', '#475569'];

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

function ColorsBarRow({ fill, onChange }: { fill: string; onChange: (hex: string) => void }) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const hex = normalizeSymbologyHexForInput(fill, '#84cc16');

  return (
    <div className="si-cat-symbol-panel__colors-row">
      <button
        type="button"
        className="si-cat-symbol-panel__colors-bar"
        style={{ background: hex }}
        onClick={() => nativeRef.current?.click()}
        aria-label={`Fill color: ${hex}`}
      />
      <input
        ref={nativeRef}
        type="color"
        className="si-sym-color-field__native"
        value={hex}
        onChange={e => onChange(normalizeSymbologyHexForInput(e.target.value, '#84cc16'))}
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        className="si-cat-symbol-panel__colors-edit"
        title="Edit fill color"
        aria-label="Edit fill color"
        onClick={() => nativeRef.current?.click()}
      >
        <i className="fa-solid fa-pen" aria-hidden />
      </button>
    </div>
  );
}

function ArcGisSymbolColorField({
  label,
  value,
  fallback,
  presets,
  allowNoColor,
  onChange,
  onNoColor,
}: {
  label: string;
  value: string;
  fallback: string;
  presets: string[];
  allowNoColor?: boolean;
  onChange: (hex: string) => void;
  onNoColor?: () => void;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const hex = normalizeSymbologyHexForInput(value, fallback);

  return (
    <div className="si-cat-symbol-panel__color-field">
      <span className="si-cat-symbol-panel__slider-label">{label}</span>
      <div className="si-cat-symbol-panel__color-row">
        <button
          type="button"
          className="si-cat-symbol-panel__color-bar"
          style={{ background: hex }}
          onClick={() => nativeRef.current?.click()}
          aria-label={`${label}: ${hex}`}
          title={hex}
        />
        <input
          ref={nativeRef}
          type="color"
          className="si-sym-color-field__native"
          value={hex}
          onChange={e => onChange(normalizeSymbologyHexForInput(e.target.value, fallback))}
          tabIndex={-1}
          aria-hidden
        />
        <button
          type="button"
          className="si-cat-symbol-panel__colors-edit"
          title={`Edit ${label.toLowerCase()}`}
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={() => nativeRef.current?.click()}
        >
          <i className="fa-solid fa-pen" aria-hidden />
        </button>
        {presets.map((preset, index) => (
          <button
            key={preset}
            type="button"
            className={
              'si-cat-symbol-panel__color-preset' +
              (index === presets.length - 1 ? ' si-cat-symbol-panel__color-preset--square' : '')
            }
            style={{ background: preset }}
            title={preset}
            aria-label={`Preset ${preset}`}
            onClick={() => onChange(preset)}
          />
        ))}
        {allowNoColor ? (
          <button
            type="button"
            className="si-cat-symbol-panel__color-none"
            title="No color"
            aria-label="No color"
            onClick={onNoColor}
          >
            <i className="fa-solid fa-ban" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StrokeSectionIcon({
  style,
  geometryKind,
  mapZoom,
}: {
  style: SymbologyCategoryStyle;
  geometryKind: 'polygon' | 'line' | 'point';
  mapZoom?: number;
}) {
  const color = style.outlineOpacity <= 0 ? '#c8c8c8' : style.outline || '#334155';
  const previewW = symOutlinePreviewPx(
    style.outlineWidth ?? 1,
    mapZoom,
    geometryKind === 'line' ? 1.6 : 1.2,
  );

  if (geometryKind === 'polygon' || geometryKind === 'point') {
    return (
      <span
        className="si-cat-symbol-panel__section-icon si-cat-symbol-panel__section-icon--stroke-box"
        style={{
          borderColor: color,
          borderWidth: `${previewW}px`,
        }}
        aria-hidden
      />
    );
  }

  return (
    <span
      className="si-cat-symbol-panel__section-icon si-cat-symbol-panel__section-icon--stroke-line"
      style={
        {
          '--si-stroke-line-w': `${previewW}px`,
          '--si-stroke-line-color': color,
        } as React.CSSProperties
      }
      aria-hidden
    />
  );
}
function SymbolPreview({
  style,
  geometryKind,
  previewCornerRadius,
  markerR,
  rot,
  mapZoom,
}: {
  style: SymbologyCategoryStyle;
  geometryKind: 'polygon' | 'line' | 'point';
  previewCornerRadius: number;
  markerR: number;
  rot: number;
  mapZoom?: number;
}) {
  const rx = Math.min(8, Math.max(0, previewCornerRadius));
  if (geometryKind === 'point') {
    return (
      <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden>
        <g transform={`rotate(${rot} 20 14)`}>
          <circle
            cx="20"
            cy="14"
            r={Math.min(10, markerR)}
            fill={style.fill}
            fillOpacity={style.fillOpacity}
            stroke={style.outline}
            strokeOpacity={style.outlineOpacity}
            strokeWidth={symOutlinePreviewPx(style.outlineWidth, mapZoom)}
          />
        </g>
      </svg>
    );
  }
  if (geometryKind === 'line') {
    return (
      <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden>
        <line
          x1="4"
          y1="20"
          x2="36"
          y2="8"
          stroke={style.outline}
          strokeOpacity={style.outlineOpacity}
          strokeWidth={symOutlinePreviewPx(style.outlineWidth, mapZoom, 1.4)}
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
    );
  }
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden>
      <rect
        x="6"
        y="5"
        width="28"
        height="18"
        rx={rx}
        fill={style.fill}
        fillOpacity={style.fillOpacity}
        stroke={style.outline}
        strokeOpacity={style.outlineOpacity}
        strokeWidth={symOutlinePreviewPx(style.outlineWidth, mapZoom, 1.2)}
      />
    </svg>
  );
}

export function SiCategorySymbolStylePanel({
  categoryLabel,
  style,
  geometryKind = 'polygon',
  previewCornerRadius = 8,
  mapZoom,
  onChange,
  onClose,
  embedded = false,
}: SiCategorySymbolStylePanelProps) {
  const [strokeOpen, setStrokeOpen] = useState(true);
  const [fillOpen, setFillOpen] = useState(true);
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

      <div className="si-cat-symbol-panel__nav-row">
        <span className="si-cat-symbol-panel__nav-preview">
          <SymbolPreview
            style={style}
            geometryKind={geometryKind}
            previewCornerRadius={previewCornerRadius}
            markerR={markerR}
            rot={rot}
            mapZoom={mapZoom}
          />
        </span>
        <span className="si-cat-symbol-panel__nav-label">{typeLabel}</span>
        <i className="fa-solid fa-chevron-right si-cat-symbol-panel__nav-chev" aria-hidden />
      </div>

      <div className="si-cat-symbol-panel__nav-row">
        <span className="si-cat-symbol-panel__nav-label">{categoryLabel}</span>
        <i className="fa-solid fa-chevron-right si-cat-symbol-panel__nav-chev" aria-hidden />
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
        <SiSymbologyLightSelect
          id="si-cat-line-dash"
          label="Line style"
          value={style.lineDash ?? 'solid'}
          options={[...LINE_DASH_OPTIONS]}
          onChange={v => patch({ lineDash: (v || 'solid') as SymbologyCategoryStyle['lineDash'] })}
          className="si-cat-symbol-panel__field"
        />
      ) : null}

      {!isLine ? (
        <div className="si-cat-symbol-panel__colors">
          <span className="si-cat-symbol-panel__colors-label">Colors</span>
          <ColorsBarRow fill={style.fill} onChange={fill => patch({ fill })} />
        </div>
      ) : null}

      {!isLine ? (
        <SliderField
          label="Fill transparency"
          value={Math.round((1 - style.fillOpacity) * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={pct => patch({ fillOpacity: Math.max(0, Math.min(1, 1 - pct / 100)) })}
        />
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
          <StrokeSectionIcon style={style} geometryKind={geometryKind} mapZoom={mapZoom} />
          <span>Solid stroke</span>
        </button>
        {strokeOpen ? (
          <div className="si-cat-symbol-panel__section-body">
            <ArcGisSymbolColorField
              label="Color"
              value={style.outline}
              fallback="#334155"
              presets={STROKE_COLOR_PRESETS}
              allowNoColor
              onChange={outline => patch({ outline, outlineOpacity: outline ? Math.max(style.outlineOpacity, 0.01) : 0 })}
              onNoColor={() => patch({ outlineOpacity: 0 })}
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
              <ArcGisSymbolColorField
                label="Fill color"
                value={style.fill}
                fallback="#84cc16"
                presets={FILL_COLOR_PRESETS}
                allowNoColor
                onChange={fill => patch({ fill, fillOpacity: fill ? Math.max(style.fillOpacity, 0.01) : 0 })}
                onNoColor={() => patch({ fillOpacity: 0 })}
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
