import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SymbologyCategoryStyle } from '../layerTypes';
import type {
  SymbologyClassMethod,
  SymbologyColorRamp,
  SymbologyConfig,
  SymbologyStyle,
} from '../layerTypes';
import type { SymbologyContext } from '../symbologyHelpers';
import {
  clampInt,
  describeArcGisRendererVisualization,
  getGeoJsonFields,
  getLayerGeometryKind,
  getNumericFields,
  sampleRamp,
} from '../symbologyHelpers';
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay';
import {
  SI_SYMBOLOGY_RAMP_OPTIONS,
  SI_SYMBOLOGY_STYLE_OPTIONS,
  SI_STYLE_PRESET_CHIPS,
} from './siSymbologyStudioConstants';
import {
  buildSiSymbologyLegendItems,
  makeUniqueLegendLabel,
  siClassColorKey,
  type SiSymbologyLegendItem,
} from '../utils/siSymbologyLegendItems';
import type { SiSymbologyAppearance } from '../siSymbolStyleStudio';
import './SiSymbologySidePanel.css';

export type SiSymbologyDraft = Required<SymbologyConfig> & {
  arcgisMaxCategories: number;
  categoryColors?: Record<string, string>;
  categoryStyles?: Record<string, SymbologyCategoryStyle>;
};

export type SiSymbologyPanelStep = 'attributes' | 'pick-style' | 'style-options' | 'symbol-edit';

const STYLE_THUMB: Record<SymbologyStyle, string> = {
  single: 'single',
  unique: 'unique',
  color: 'color',
  size: 'size',
  color_size: 'color_size',
  dot_density: 'dot_density',
  threshold_markers: 'threshold',
};

export type SiSymbologySidePanelProps = {
  layerName: string;
  layerColor: string;
  geojson: unknown;
  arcDef: ArcgisLayerDefLite | null;
  arcgisDrawingInfo: unknown;
  arcgisLayerDefinition: unknown;
  sourceUrl?: string;
  isRaster: boolean;
  draft: SiSymbologyDraft;
  appearance: SiSymbologyAppearance;
  symbologyCtx: SymbologyContext | null;
  canUseArcGisOnline: boolean;
  categorySymbolEdit: { valueKey: string; label: string } | null;
  onDraftChange: (patch: Partial<SiSymbologyDraft>) => void;
  onAppearanceChange: (patch: Partial<SiSymbologyAppearance>) => void;
  onCategorySymbolEdit: (edit: { valueKey: string; label: string } | null) => void;
  onCategoryStyleChange: (valueKey: string, next: SymbologyCategoryStyle) => void;
  onToggleArcGisOnline: (on: boolean) => void;
  onReset: () => void;
  onClose: () => void;
  onDone: () => void;
};

function rampCss(ramp: SymbologyColorRamp): string {
  const map: Record<string, string> = {
    viridis: 'linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)',
    blues: 'linear-gradient(90deg,#f7fbff,#6baed6,#08306b)',
    greens: 'linear-gradient(90deg,#f7fcf5,#74c476,#00441b)',
    plasma: 'linear-gradient(90deg,#0d0887,#cc4778,#f0f921)',
    magma: 'linear-gradient(90deg,#000004,#b73779,#fcfdbf)',
    turbo: 'linear-gradient(90deg,#30123b,#6bc2a0,#fcffa4)',
    cividis: 'linear-gradient(90deg,#00204c,#7ea06a,#ffffe0)',
    spectral: 'linear-gradient(90deg,#9e0142,#f46d43,#fee08b,#66c2a5,#5e4fa2)',
    earth: 'linear-gradient(90deg,#8c510a,#d8b365,#f6e8c3,#5ab4ac,#01665e)',
    gray: 'linear-gradient(90deg,#f7f7f7,#969696,#252525)',
    inferno: 'linear-gradient(90deg,#000004,#bc3754,#fcffa4)',
    service: 'linear-gradient(90deg,#64748b,#94a3b8)',
    green: 'linear-gradient(90deg,#dcfce7,#22c55e,#14532d)',
  };
  return map[ramp] ?? map.viridis;
}

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

function buildClassColorsFromRamp(ramp: SymbologyColorRamp, classCount: number): Record<string, string> {
  const palette = sampleRamp(ramp, classCount);
  const out: Record<string, string> = {};
  for (let i = 0; i < classCount; i += 1) {
    out[siClassColorKey(i)] = palette[i] ?? palette[0] ?? '#94a3b8';
  }
  return out;
}

export function SiSymbologySidePanel({
  layerName,
  layerColor,
  geojson,
  arcDef,
  arcgisDrawingInfo,
  arcgisLayerDefinition,
  isRaster,
  draft,
  appearance,
  symbologyCtx,
  canUseArcGisOnline,
  categorySymbolEdit,
  onDraftChange,
  onAppearanceChange,
  onCategorySymbolEdit,
  onCategoryStyleChange,
  onToggleArcGisOnline,
  onReset,
  onClose,
  onDone,
}: SiSymbologySidePanelProps) {
  const [step, setStep] = useState<SiSymbologyPanelStep>(() =>
    draft.field?.trim() ? 'pick-style' : 'attributes',
  );
  const [openAcc, setOpenAcc] = useState({
    appearance: false,
    advanced: false,
    tools: false,
    transparency: false,
    rotation: false,
  });

  useEffect(() => {
    if (categorySymbolEdit) setStep('symbol-edit');
  }, [categorySymbolEdit]);

  useEffect(() => {
    if (step === 'style-options' && draft.style === 'single') {
      setOpenAcc(a => ({ ...a, appearance: true }));
    }
  }, [step, draft.style]);

  const allFields = useMemo(() => getGeoJsonFields(geojson), [geojson]);
  const numericFields = useMemo(() => getNumericFields(geojson), [geojson]);
  const geometryKind = useMemo(() => getLayerGeometryKind(geojson), [geojson]);
  const layerFeatures = useMemo(
    () => (Array.isArray((geojson as { features?: unknown[] })?.features) ? (geojson as { features: unknown[] }).features : []),
    [geojson],
  );

  const isUnique = draft.style === 'unique';
  const isSingle = draft.style === 'single';
  const classes = clampInt(draft.classes, 2, 12);
  const showColor = draft.style === 'color' || draft.style === 'color_size' || (isUnique && geometryKind !== 'line');
  const showSize = draft.style === 'size' || draft.style === 'color_size';
  const showMethod =
    draft.style !== 'unique' && draft.style !== 'threshold_markers' && draft.style !== 'single';
  const showClasses = !isSingle;

  const styleCards = useMemo(() => {
    const numericOnly = new Set<SymbologyStyle>(['color', 'size', 'color_size', 'dot_density', 'threshold_markers']);
    return SI_SYMBOLOGY_STYLE_OPTIONS.filter(opt => {
      if (geometryKind === 'line' && (opt.value === 'color_size' || opt.value === 'dot_density')) return false;
      if (draft.field && numericFields.includes(draft.field) && opt.value === 'unique') return true;
      if (draft.field && allFields.includes(draft.field) && !numericFields.includes(draft.field) && numericOnly.has(opt.value)) {
        return false;
      }
      return true;
    });
  }, [geometryKind, draft.field, allFields, numericFields]);

  const uniqueLegendLabel = useMemo(
    () => makeUniqueLegendLabel(draft.field, layerFeatures, arcDef),
    [draft.field, layerFeatures, arcDef],
  );

  const legendItems = useMemo(
    () =>
      buildSiSymbologyLegendItems({
        style: draft.style,
        classes,
        field: draft.field,
        geometryKind,
        ctx: symbologyCtx,
        appearance,
        layerColor,
        layerFeatures,
        arcDef,
        uniqueLegendLabel,
      }),
    [
      draft.style,
      classes,
      draft.field,
      geometryKind,
      symbologyCtx,
      appearance,
      layerColor,
      layerFeatures,
      arcDef,
      uniqueLegendLabel,
    ],
  );

  const valueCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!draft.field) return m;
    for (const f of layerFeatures) {
      const props = (f as { properties?: Record<string, unknown> })?.properties;
      const v = props?.[draft.field];
      const key = v === null || v === undefined || v === '' ? '(null)' : String(v);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [draft.field, layerFeatures]);

  const pickStyle = useCallback(
    (style: SymbologyStyle) => {
      const patch: Partial<SiSymbologyDraft> = { style, useArcGisOnline: false };
      if (style === 'color' || style === 'color_size' || style === 'size' || style === 'dot_density') {
        patch.categoryColors = buildClassColorsFromRamp(draft.colorRamp, classes);
      }
      onDraftChange(patch);
      setStep('style-options');
    },
    [onDraftChange, draft.colorRamp, classes],
  );

  useEffect(() => {
    if (draft.useArcGisOnline || draft.style !== 'unique' || !symbologyCtx?.categories.length) return;
    if (draft.categoryColors && Object.keys(draft.categoryColors).length > 0) return;
    const seeded: Record<string, string> = {};
    for (const v of symbologyCtx.categories) {
      const c = symbologyCtx.categoryColors[v];
      if (c) seeded[v] = c;
    }
    if (Object.keys(seeded).length) onDraftChange({ categoryColors: seeded });
  }, [draft.style, draft.useArcGisOnline, draft.categoryColors, symbologyCtx, onDraftChange]);

  const applyLegendFillColor = useCallback(
    (item: SiSymbologyLegendItem, hex: string) => {
      const fill = hex.trim();
      if (!fill) return;
      if (isSingle || item.valueKey === '__si_single_fill') {
        onAppearanceChange({
          fillColor: fill,
          color: appearance.color.startsWith('#') ? appearance.color : fill,
        });
        return;
      }
      if (!item.valueKey) return;
      onDraftChange({
        categoryColors: {
          ...(draft.categoryColors ?? {}),
          [item.valueKey]: fill,
        },
      });
    },
    [isSingle, onAppearanceChange, onDraftChange, draft.categoryColors, appearance.color],
  );

  const applyLegendOutlineColor = useCallback(
    (hex: string) => {
      const stroke = hex.trim();
      if (!stroke) return;
      onAppearanceChange({ color: stroke });
    },
    [onAppearanceChange],
  );

  const renderLegendColorRow = (it: SiSymbologyLegendItem, idx: number, opts?: { showCount?: boolean }) => {
    const fillHex = toColorInputHex(it.fill || it.color, '#38bdf8');
    const outlineHex = toColorInputHex(it.color, '#0f172a');
    const count = it.valueKey && opts?.showCount ? valueCounts.get(it.valueKey) ?? 0 : null;
    const active = it.valueKey && categorySymbolEdit?.valueKey === it.valueKey;
    return (
      <div
        key={it.valueKey ?? `${it.label}-${idx}`}
        className={`si-sym-side-value-row${active ? ' si-sym-side-value-row--active' : ''}`}
      >
        <span
          className="si-sym-side-value-row__swatch"
          style={
            {
              '--si-sym-fill': it.fill || it.color,
              '--si-sym-outline': it.color,
            } as React.CSSProperties
          }
          aria-hidden
        />
        <span className="si-sym-side-value-row__label" title={it.label}>
          {it.label}
        </span>
        <label className="si-sym-side-value-row__color-field" title="Fill color">
          <span className="si-sym-side-value-row__color-kicker">Fill</span>
          <input
            type="color"
            className="si-sym-side-value-row__color-input"
            value={fillHex}
            onChange={e => applyLegendFillColor(it, e.target.value)}
            aria-label={`Fill color for ${it.label}`}
          />
        </label>
        {isSingle ? (
          <label className="si-sym-side-value-row__color-field" title="Outline color">
            <span className="si-sym-side-value-row__color-kicker">Line</span>
            <input
              type="color"
              className="si-sym-side-value-row__color-input"
              value={outlineHex}
              onChange={e => applyLegendOutlineColor(e.target.value)}
              aria-label="Outline color"
            />
          </label>
        ) : isUnique && it.valueKey ? (
          <button
            type="button"
            className="si-sym-side-value-row__edit-btn"
            title={`Advanced symbol — ${it.label}`}
            onClick={() => onCategorySymbolEdit({ valueKey: it.valueKey!, label: it.label })}
          >
            <i className="fa-solid fa-palette" aria-hidden />
          </button>
        ) : null}
        {count !== null ? <span className="si-sym-side-value-row__count">{count}</span> : null}
      </div>
    );
  };

  const headerTitle =
    step === 'symbol-edit'
      ? 'Symbol style'
      : step === 'attributes'
        ? 'Styles'
        : step === 'pick-style'
          ? 'Styles'
          : 'Style options';

  const showBack = step === 'pick-style' || step === 'style-options' || step === 'symbol-edit';

  const goBack = () => {
    if (step === 'symbol-edit') {
      onCategorySymbolEdit(null);
      setStep('style-options');
      return;
    }
    if (step === 'style-options') {
      setStep('pick-style');
      return;
    }
    setStep('attributes');
  };

  if (isRaster) {
    return (
      <div className="si-sym-side-panel">
        <div className="si-sym-side-panel__layer-bar">
          <i className="fa-solid fa-layer-group" aria-hidden />
          <span title={layerName}>{layerName}</span>
        </div>
        <div className="si-sym-side-panel__head">
          <span className="si-sym-side-panel__title">Styles</span>
          <button type="button" className="si-sym-side-panel__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
        <div className="si-sym-side-panel__body">
          <p className="si-sym-side-banner">
            Raster layers use the map <strong>Symbology</strong> tool (palette icon) for classified color ramps and opacity.
          </p>
        </div>
        <footer className="si-sym-side-panel__foot">
          <button type="button" className="si-sym-side-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    );
  }

  const body =
    step === 'attributes' ? (
      <div className="si-sym-side-panel__step si-sym-side-step">
        <div className="si-sym-side-step__head">
          <span className="si-sym-side-step__badge">1</span>
          <div>
            <h3>Choose attributes</h3>
            <p>Select the field that drives colors, sizes, or categories. Live preview updates on the map.</p>
          </div>
        </div>
        {draft.field ? (
          <div className="si-sym-side-field-chip">
            <span className="si-sym-side-field-chip__icon">123</span>
            <span className="si-sym-side-field-chip__name">{draft.field}</span>
            <button
              type="button"
              className="si-sym-side-field-chip__clear"
              aria-label="Clear field"
              onClick={() => onDraftChange({ field: '' })}
            >
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        ) : null}
        <div className="si-sym-side-field">
          <label className="si-sym-side-label" htmlFor="si-sym-field-pick">
            Field
          </label>
          <select
            id="si-sym-field-pick"
            className="si-sym-side-select"
            value={draft.field}
            onChange={e => onDraftChange({ field: e.target.value })}
          >
            <option value="">Select a field…</option>
            {allFields.map(f => (
              <option key={f} value={f}>
                {f}
                {numericFields.includes(f) ? ' (numeric)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="si-sym-side-actions-row">
          <button type="button" className="si-sym-side-outline-btn" disabled title="Expressions coming soon">
            + Expression
          </button>
        </div>
        {canUseArcGisOnline ? (
          <label className="si-sym-side-toggle">
            <span>Use ArcGIS Online symbology</span>
            <input
              type="checkbox"
              checked={Boolean(draft.useArcGisOnline)}
              onChange={e => onToggleArcGisOnline(e.target.checked)}
            />
          </label>
        ) : null}
      </div>
    ) : step === 'pick-style' ? (
      <div className="si-sym-side-panel__step si-sym-side-step">
        <div className="si-sym-side-step__head">
          <span className="si-sym-side-step__badge">2</span>
          <div>
            <h3>Pick a style</h3>
            <p>
              {numericFields.includes(draft.field)
                ? 'These styles work well for numeric fields.'
                : 'These styles work well for categorical fields.'}
            </p>
          </div>
        </div>
        <div className="si-sym-style-cards">
          {styleCards.map(opt => {
            const selected = draft.style === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`si-sym-style-card${selected ? ' si-sym-style-card--on' : ''}`}
                onClick={() => pickStyle(opt.value)}
              >
                <div className={`si-sym-style-card__thumb si-sym-style-card__thumb--${STYLE_THUMB[opt.value]}`} />
                {selected ? (
                  <span className="si-sym-style-card__check">
                    <i className="fa-solid fa-circle-check" aria-hidden />
                  </span>
                ) : null}
                <div className="si-sym-style-card__meta">
                  <div className="si-sym-style-card__title">
                    {opt.label}
                    <i className="fa-regular fa-circle-question" title={opt.hint} aria-hidden />
                  </div>
                  <div className="si-sym-style-card__hint">{opt.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ) : step === 'symbol-edit' && categorySymbolEdit ? (
      <div className="si-sym-side-panel__step">
        <p className="si-sym-side-banner">
          Symbol style editor is open — drag the floating panel to position it. Changes preview on the map
          live; press <strong>Apply</strong> then <strong>Done</strong> to persist on the layer.
        </p>
        <button
          type="button"
          className="si-sym-side-outline-btn"
          onClick={() => {
            onCategorySymbolEdit(null);
            setStep('style-options');
          }}
        >
          Back to types list
        </button>
      </div>
    ) : (
      <div className="si-sym-side-panel__step si-sym-side-step">
        {draft.useArcGisOnline ? (
          <div className="si-sym-side-banner">
            ArcGIS renderer is active. Uncheck &quot;Use ArcGIS Online symbology&quot; in step 1 to edit custom styles.
            {(() => {
              const renderer =
                (arcgisDrawingInfo as { renderer?: unknown })?.renderer ??
                (arcgisLayerDefinition as { drawingInfo?: { renderer?: unknown } })?.drawingInfo?.renderer;
              return renderer ? (
                <div style={{ marginTop: 8 }}>{describeArcGisRendererVisualization(renderer)}</div>
              ) : null;
            })()}
          </div>
        ) : null}

        <div className="si-sym-side-acc">
          <button
            type="button"
            className="si-sym-side-acc__trigger"
            onClick={() => setOpenAcc(a => ({ ...a, tools: !a.tools }))}
          >
            <i className={`fa-solid fa-chevron-${openAcc.tools ? 'down' : 'right'}`} aria-hidden />
            Style tools
          </button>
          {openAcc.tools ? (
            <div className="si-sym-side-acc__body si-sym-side-actions-row">
              <button type="button" className="si-sym-side-outline-btn" onClick={onReset} disabled={draft.useArcGisOnline}>
                Reset
              </button>
            </div>
          ) : null}
        </div>

        {!draft.useArcGisOnline ? (
          <>
            <div className="si-sym-side-field">
              <span className="si-sym-side-label">Attribute</span>
              <div className="si-sym-side-field-chip" style={{ marginBottom: 0 }}>
                <span className="si-sym-side-field-chip__icon">{isUnique ? 'Aa' : '123'}</span>
                <span className="si-sym-side-field-chip__name">{draft.field || '—'}</span>
                <button type="button" className="si-sym-side-outline-btn" style={{ padding: '4px 8px' }} onClick={() => setStep('attributes')}>
                  Change
                </button>
              </div>
            </div>

            {showColor && !isUnique ? (
              <div className="si-sym-side-field">
                <label className="si-sym-side-label" htmlFor="si-sym-ramp">
                  Color scheme
                </label>
                <select
                  id="si-sym-ramp"
                  className="si-sym-side-select"
                  value={draft.colorRamp}
                  onChange={e => {
                    const ramp = e.target.value as SymbologyColorRamp;
                    onDraftChange({
                      colorRamp: ramp,
                      categoryColors: buildClassColorsFromRamp(ramp, classes),
                    });
                  }}
                >
                  {SI_SYMBOLOGY_RAMP_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="si-sym-side-ramp" style={{ backgroundImage: rampCss(draft.colorRamp) }} aria-hidden />
              </div>
            ) : null}

            {showClasses ? (
              <div className="si-sym-side-field">
                <label className="si-sym-side-label" htmlFor="si-sym-classes">
                  {isUnique ? 'Max categories' : 'Number of classes'}
                </label>
                <select
                  id="si-sym-classes"
                  className="si-sym-side-select"
                  value={String(classes)}
                  onChange={e => {
                    const nextClasses = parseInt(e.target.value, 10);
                    onDraftChange({
                      classes: nextClasses,
                      categoryColors: buildClassColorsFromRamp(draft.colorRamp, nextClasses),
                    });
                  }}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {showMethod ? (
              <div className="si-sym-side-field">
                <label className="si-sym-side-label" htmlFor="si-sym-method">
                  Classification
                </label>
                <select
                  id="si-sym-method"
                  className="si-sym-side-select"
                  value={draft.method}
                  onChange={e => onDraftChange({ method: e.target.value as SymbologyClassMethod })}
                >
                  <option value="jenks">Natural breaks (Jenks)</option>
                  <option value="quantile">Quantile</option>
                  <option value="equal_interval">Equal interval</option>
                </select>
              </div>
            ) : null}

            {draft.style === 'threshold_markers' ? (
              <div className="si-sym-side-field">
                <label className="si-sym-side-label" htmlFor="si-sym-threshold">
                  Threshold
                </label>
                <input
                  id="si-sym-threshold"
                  className="si-sym-side-select"
                  type="number"
                  value={Number.isFinite(draft.threshold) ? String(draft.threshold) : ''}
                  onChange={e =>
                    onDraftChange({
                      threshold: e.target.value === '' ? Number.NaN : Number(e.target.value),
                    })
                  }
                />
              </div>
            ) : null}

            {isUnique ? (
              <div className="si-sym-side-field">
                <span className="si-sym-side-label">Types — pick a color per value</span>
                <div className="si-sym-side-value-list">
                  <div className="si-sym-side-value-list__head">
                    <span>{draft.field}</span>
                    <span style={{ marginLeft: 'auto' }}>{layerFeatures.length}</span>
                  </div>
                  {legendItems.map((it, idx) => renderLegendColorRow(it, idx, { showCount: true }))}
                </div>
              </div>
            ) : (
              <div className="si-sym-side-field">
                <span className="si-sym-side-label">Legend preview — pick colors</span>
                <p className="si-sym-side-hint">Each color updates the map immediately.</p>
                <div className="si-sym-side-value-list">
                  {legendItems.map((it, idx) => renderLegendColorRow(it, idx))}
                </div>
              </div>
            )}

            <div className="si-sym-side-acc">
              <button
                type="button"
                className="si-sym-side-acc__trigger"
                onClick={() => setOpenAcc(a => ({ ...a, appearance: !a.appearance }))}
              >
                <i className={`fa-solid fa-chevron-${openAcc.appearance ? 'down' : 'right'}`} aria-hidden />
                Symbol appearance (live map)
              </button>
              {openAcc.appearance ? (
                <div className="si-sym-side-acc__body">
                  <div className="si-sym-side-field">
                    <label className="si-sym-side-label">Outline / fill</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="color"
                        value={appearance.color.startsWith('#') ? appearance.color : '#94a3b8'}
                        onChange={e => onAppearanceChange({ color: e.target.value })}
                        aria-label="Outline"
                      />
                      <input
                        type="color"
                        value={appearance.fillColor.startsWith('#') ? appearance.fillColor : '#38bdf8'}
                        onChange={e => onAppearanceChange({ fillColor: e.target.value })}
                        aria-label="Fill"
                      />
                    </div>
                  </div>
                  <div className="si-sym-side-slider">
                    <div className="si-sym-side-slider__row">
                      <span>Layer opacity</span>
                      <span>{Math.round(appearance.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={Math.round(appearance.opacity * 100)}
                      onChange={e => onAppearanceChange({ opacity: Number(e.target.value) / 100 })}
                    />
                  </div>
                  <div className="si-sym-side-slider">
                    <div className="si-sym-side-slider__row">
                      <span>Outline width</span>
                      <span>{appearance.weight.toFixed(1)} px</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={160}
                      value={Math.round(appearance.weight * 10)}
                      onChange={e => onAppearanceChange({ weight: Number(e.target.value) / 10 })}
                    />
                  </div>
                  <div className="si-sym-side-actions-row">
                    {SI_STYLE_PRESET_CHIPS.slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="si-sym-side-outline-btn"
                        onClick={() => onAppearanceChange({ ...p.patch })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="si-sym-side-acc">
              <button
                type="button"
                className="si-sym-side-acc__trigger"
                onClick={() => setOpenAcc(a => ({ ...a, transparency: !a.transparency }))}
              >
                <i className={`fa-solid fa-chevron-${openAcc.transparency ? 'down' : 'right'}`} aria-hidden />
                Transparency by attribute
              </button>
              {openAcc.transparency ? (
                <div className="si-sym-side-acc__body">
                  <p style={{ margin: 0, fontSize: 11, color: 'rgba(148,163,184,0.9)' }}>
                    Per-feature transparency from attributes is planned; use layer opacity above for now.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="si-sym-side-acc">
              <button
                type="button"
                className="si-sym-side-acc__trigger"
                onClick={() => setOpenAcc(a => ({ ...a, rotation: !a.rotation }))}
              >
                <i className={`fa-solid fa-chevron-${openAcc.rotation ? 'down' : 'right'}`} aria-hidden />
                Rotation by attribute
              </button>
              {openAcc.rotation ? (
                <div className="si-sym-side-acc__body">
                  <p style={{ margin: 0, fontSize: 11, color: 'rgba(148,163,184,0.9)' }}>
                    Symbol rotation by field will be available in a future update.
                  </p>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    );

  const footPrimary =
    step === 'attributes' ? (
      <button
        type="button"
        className="si-sym-side-btn si-sym-side-btn--primary"
        disabled={!draft.field?.trim()}
        onClick={() => {
          onDraftChange({ useArcGisOnline: false });
          setStep('pick-style');
        }}
      >
        Next
      </button>
    ) : step === 'pick-style' ? null : (
      <button type="button" className="si-sym-side-btn si-sym-side-btn--primary" onClick={onDone}>
        Done
      </button>
    );

  return (
    <div
      id="si-layer-action-title"
      className={`si-sym-side-panel${categorySymbolEdit ? ' si-sym-side-panel--with-symbol' : ''}`}
      role="dialog"
      aria-modal="false"
    >
      <div className="si-sym-side-panel__layer-bar">
        <i className="fa-solid fa-chevron-down" aria-hidden style={{ fontSize: 10, opacity: 0.7 }} />
        <span title={layerName}>{layerName}</span>
      </div>
      <header className="si-sym-side-panel__head">
        {showBack ? (
          <button type="button" className="si-sym-side-panel__back" onClick={goBack} aria-label="Back">
            <i className="fa-solid fa-chevron-left" aria-hidden />
          </button>
        ) : null}
        <span className="si-sym-side-panel__title">{headerTitle}</span>
        <button type="button" className="si-sym-side-panel__close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="si-sym-side-panel__body">{body}</div>
      {categorySymbolEdit && step !== 'symbol-edit' ? (
        <div className="si-sym-side-symbol-dock" aria-hidden />
      ) : null}
      <footer className="si-sym-side-panel__foot">
        <button type="button" className="si-sym-side-btn" onClick={onClose}>
          Cancel
        </button>
        {footPrimary}
      </footer>
    </div>
  );
}
