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
  readGeoJsonPropertyString,
  sampleRamp,
  SI_SYMBOLOGY_OTHER_VALUE_KEY,
} from '../symbologyHelpers';
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay';
import {
  SI_SYMBOLOGY_RAMP_OPTIONS,
  SI_SYMBOLOGY_STYLE_OPTIONS,
  SI_STYLE_PRESET_CHIPS,
} from './siSymbologyStudioConstants';
import {
  fieldKindLabel,
  filterStyleOptionsForSmartMapping,
  getFieldKindMap,
  inferFieldKind,
  orderStyleOptionsForSuggestions,
  smartMappingHintForField,
  suggestSymbologyStyleForField,
  type SiFieldKind,
} from '../utils/siSymbologySmartMapping';
import {
  buildGraduatedClassColorMap,
  isGraduatedSymbologyStyle,
} from '../siLayerSymbologyEngine';
import {
  buildSiSymbologyLegendItems,
  makeUniqueLegendLabel,
  siClassColorKey,
  type SiSymbologyLegendItem,
} from '../utils/siSymbologyLegendItems';
import type { SiSymbologyAppearance } from '../siSymbolStyleStudio';
import type { SiMapTerrainSettings } from '../utils/siMapProjectionTerrain';
import { SiContourClassificationStudio } from './SiContourClassificationStudio';
import './SiSymbologySidePanel.css';

export type SiSymbologyDraft = Required<SymbologyConfig> & {
  arcgisMaxCategories: number;
  categoryColors?: Record<string, string>;
  categoryStyles?: Record<string, SymbologyCategoryStyle>;
};

export type SiSymbologyPanelStep =
  | 'attributes'
  | 'pick-style'
  | 'style-options'
  | 'symbol-edit'
  | 'contour-classification';

const STYLE_THUMB: Record<SymbologyStyle, string> = {
  single: 'single',
  unique: 'unique',
  color: 'color',
  size: 'size',
  color_size: 'color_size',
  dot_density: 'dot_density',
  threshold_markers: 'threshold',
};

function styleOptionsSectionTitle(style: SymbologyStyle): string {
  switch (style) {
    case 'unique':
      return 'Types (Unique symbols)';
    case 'color':
      return 'Counts and amounts (Graduated colors)';
    case 'size':
      return 'Counts and amounts (Graduated symbols)';
    case 'color_size':
      return 'Counts and amounts (Color & size)';
    case 'single':
      return 'Location (Single symbol)';
    case 'dot_density':
      return 'Dot density';
    case 'threshold_markers':
      return 'Classified markers';
    default:
      return 'Style options';
  }
}

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
  onApply: () => void;
  onDone: () => void;
  /** Terrain contour classification (global map overlays). */
  contourSettings?: SiMapTerrainSettings;
  onContourSettingsChange?: (patch: Partial<SiMapTerrainSettings>) => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
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

/** Unique-value keys (feature category strings), not graduated `__si_class_*` slots. */
function buildUniqueCategoryColorsFromRamp(
  ramp: SymbologyColorRamp,
  categories: string[],
  existing?: Record<string, string>,
): Record<string, string> {
  const cats = categories.filter(Boolean);
  if (!cats.length) return existing ? { ...existing } : {};
  const palette = sampleRamp(ramp, Math.max(2, cats.length));
  const out: Record<string, string> = {};
  cats.forEach((v, idx) => {
    out[v] = existing?.[v] ?? palette[idx % palette.length] ?? palette[0] ?? '#94a3b8';
  });
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
  onApply,
  onDone,
  contourSettings,
  onContourSettingsChange,
  onHeaderPointerDown,
}: SiSymbologySidePanelProps) {
  const [step, setStep] = useState<SiSymbologyPanelStep>('attributes');
  const [openAcc, setOpenAcc] = useState({
    appearance: false,
    advanced: false,
    tools: false,
  });

  useEffect(() => {
    if (categorySymbolEdit) {
      setStep('symbol-edit');
    } else if (step === 'symbol-edit') {
      setStep('style-options');
    }
  }, [categorySymbolEdit, step]);

  useEffect(() => {
    if (!draft.field?.trim()) setStep('attributes');
  }, [draft.field]);

  useEffect(() => {
    if (draft.useArcGisOnline && step === 'style-options') setStep('attributes');
  }, [draft.useArcGisOnline, step]);

  useEffect(() => {
    if (draft.style === 'single') {
      setOpenAcc(a => ({ ...a, appearance: true }));
    }
  }, [draft.style]);

  const allFields = useMemo(() => getGeoJsonFields(geojson), [geojson]);
  const numericFields = useMemo(() => getNumericFields(geojson), [geojson]);
  const fieldKinds = useMemo(() => getFieldKindMap(geojson, allFields), [geojson, allFields]);
  const activeFieldKind: SiFieldKind = draft.field
    ? fieldKinds[draft.field] ?? inferFieldKind(geojson, draft.field)
    : 'text';
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

  const uniqueValueCount = useMemo(() => {
    if (!draft.field) return 0;
    return new Set(
      layerFeatures.map(f => {
        const v = (f as { properties?: Record<string, unknown> })?.properties?.[draft.field];
        return v === null || v === undefined || v === '' ? '(null)' : String(v);
      }),
    ).size;
  }, [draft.field, layerFeatures]);

  const suggestedStyle = useMemo(
    () => suggestSymbologyStyleForField(activeFieldKind, geometryKind, uniqueValueCount),
    [activeFieldKind, geometryKind, uniqueValueCount],
  );

  const styleCards = useMemo(() => {
    const filtered = filterStyleOptionsForSmartMapping(
      SI_SYMBOLOGY_STYLE_OPTIONS,
      activeFieldKind,
      geometryKind,
    );
    return draft.field
      ? orderStyleOptionsForSuggestions(filtered, suggestedStyle)
      : filtered;
  }, [geometryKind, draft.field, activeFieldKind, suggestedStyle]);

  const selectField = useCallback(
    (field: string) => {
      if (!field) {
        onDraftChange({ field: '' });
        return;
      }
      const kind = inferFieldKind(geojson, field);
      const style = suggestSymbologyStyleForField(
        kind,
        geometryKind,
        new Set(
          layerFeatures.map(f => {
            const v = (f as { properties?: Record<string, unknown> })?.properties?.[field];
            return v === null || v === undefined || v === '' ? '(null)' : String(v);
          }),
        ).size,
      );
      const patch: Partial<SiSymbologyDraft> = {
        field,
        style,
        useArcGisOnline: false,
      };
      if (isGraduatedSymbologyStyle(style)) {
        patch.categoryColors = buildGraduatedClassColorMap(draft.colorRamp, classes);
        patch.categoryStyles = undefined;
      } else if (style === 'unique') {
        patch.categoryColors = undefined;
        patch.categoryStyles = undefined;
      }
      onDraftChange(patch);
    },
    [onDraftChange, geojson, geometryKind, layerFeatures, draft.colorRamp, classes],
  );

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
      const raw = readGeoJsonPropertyString(props, draft.field);
      const key = raw || '(null)';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [draft.field, layerFeatures]);

  const pickStyle = useCallback(
    (style: SymbologyStyle) => {
      const patch: Partial<SiSymbologyDraft> = { style, useArcGisOnline: false };
      if (style === 'unique') {
        const cats = (symbologyCtx?.categories ?? [])
          .filter(c => c !== SI_SYMBOLOGY_OTHER_VALUE_KEY)
          .slice(0, classes);
        const nextColors =
          cats.length > 0
            ? buildUniqueCategoryColorsFromRamp(draft.colorRamp, cats, draft.categoryColors)
            : undefined;
        const otherFill = draft.categoryColors?.[SI_SYMBOLOGY_OTHER_VALUE_KEY];
        patch.categoryColors =
          cats.length > 0 || otherFill
            ? {
                ...(nextColors ?? {}),
                ...(otherFill ? { [SI_SYMBOLOGY_OTHER_VALUE_KEY]: otherFill } : {}),
              }
            : undefined;
        patch.categoryStyles = undefined;
      } else if (isGraduatedSymbologyStyle(style)) {
        patch.categoryColors = buildGraduatedClassColorMap(draft.colorRamp, classes);
        patch.categoryStyles = undefined;
      } else {
        patch.categoryColors = undefined;
        patch.categoryStyles = undefined;
      }
      onDraftChange(patch);
    },
    [onDraftChange, draft.colorRamp, draft.categoryColors, classes, symbologyCtx?.categories],
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
    const count =
      it.valueKey && opts?.showCount
        ? it.valueKey === SI_SYMBOLOGY_OTHER_VALUE_KEY
          ? (symbologyCtx?.otherFeatureCount ?? 0)
          : (valueCounts.get(it.valueKey) ?? 0)
        : null;
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
    step === 'contour-classification'
      ? 'Contour classification'
      : step === 'symbol-edit'
        ? 'Symbol style'
        : step === 'style-options'
          ? 'Style options'
          : 'Smart Mapping';

  const showBack =
    step === 'style-options' || step === 'symbol-edit' || step === 'contour-classification';

  const goBack = () => {
    if (step === 'contour-classification') {
      setStep('attributes');
      return;
    }
    if (step === 'symbol-edit') {
      onCategorySymbolEdit(null);
      setStep('style-options');
      return;
    }
    if (step === 'style-options') {
      setStep('attributes');
    }
  };

  const openStyleOptions = () => setStep('style-options');

  const canOpenStyleOptions = Boolean(draft.field?.trim()) && !draft.useArcGisOnline;

  if (isRaster) {
    return (
      <div className="si-sym-side-panel">
        <header className="si-sym-side-panel__head">
          <div className="si-sym-side-panel__brand">
            <i className="fa-solid fa-palette" aria-hidden />
            <div className="si-sym-side-panel__brand-text">
              <h2 className="si-sym-side-panel__title">Styles</h2>
              <p className="si-sym-side-panel__subtitle" title={layerName}>
                {layerName}
              </p>
            </div>
          </div>
          <button type="button" className="si-sym-side-panel__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>
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
    step === 'contour-classification' && contourSettings && onContourSettingsChange ? (
      <div className="si-sym-side-panel__step si-sym-side-step">
        <p className="si-sym-side-deferred-hint">
          <i className="fa-solid fa-chart-area" aria-hidden /> Contour lines update on the map as you change
          classification. Enable <strong>Lines</strong> in the terrain panel if contours are hidden.
        </p>
        <SiContourClassificationStudio
          settings={contourSettings}
          onSettingsChange={onContourSettingsChange}
        />
        <div className="si-sym-style-options-foot">
          <button type="button" className="si-sym-style-options-done" onClick={() => setStep('attributes')}>
            Done
          </button>
        </div>
      </div>
    ) : step === 'symbol-edit' && categorySymbolEdit ? (
      <div className="si-sym-side-panel__step">
        <p className="si-sym-side-banner">
          Symbol edits stay in this panel until you click <strong>Apply</strong> on Smart Mapping.
        </p>
        <button type="button" className="si-sym-side-outline-btn" onClick={goBack}>
          Back to Style options
        </button>
      </div>
    ) : step === 'style-options' && canOpenStyleOptions ? (
      <div className="si-sym-side-panel__step si-sym-side-step si-sym-side-step--options">
        <p className="si-sym-side-deferred-hint">
          <i className="fa-solid fa-sliders" aria-hidden /> The map and legend update as you change options. Click{' '}
          <strong>Apply</strong> to save this style to the layer.
        </p>

        <div className="si-sym-side-style-section">
          <h3 className="si-sym-side-style-section__title">{styleOptionsSectionTitle(draft.style)}</h3>

          {showColor ? (
            <div className="si-sym-side-symbol-strip">
              <span
                className="si-sym-side-symbol-strip__ramp"
                style={{ backgroundImage: rampCss(draft.colorRamp) }}
                aria-hidden
              />
              <span className="si-sym-side-symbol-strip__label">Symbol style</span>
              <button
                type="button"
                className="si-sym-side-symbol-strip__edit"
                title="Edit color scheme"
                onClick={() => {
                  const el = document.getElementById('si-sym-color-scheme');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
              >
                <i className="fa-solid fa-pen" aria-hidden />
              </button>
            </div>
          ) : isSingle ? (
            <div className="si-sym-side-symbol-strip">
              <span
                className="si-sym-side-symbol-strip__swatch"
                style={{ background: appearance.fillColor || appearance.color }}
                aria-hidden
              />
              <span className="si-sym-side-symbol-strip__label">Symbol style</span>
            </div>
          ) : isUnique ? (
            <div className="si-sym-side-symbol-strip">
              <span className="si-sym-side-symbol-strip__ramp si-sym-style-card__thumb--unique" aria-hidden />
              <span className="si-sym-side-symbol-strip__label">Symbol style</span>
            </div>
          ) : null}

          <div className="si-sym-side-actions-row">
            <button type="button" className="si-sym-side-outline-btn" onClick={onReset}>
              Reset style
            </button>
          </div>

          {showColor && !isUnique ? (
            <div className="si-sym-side-field" id="si-sym-color-scheme">
              <span className="si-sym-side-label">Color scheme</span>
              <div className="si-sym-ramp-cards">
                {SI_SYMBOLOGY_RAMP_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    className={`si-sym-ramp-card${draft.colorRamp === r.value ? ' si-sym-ramp-card--on' : ''}`}
                    title={r.label}
                    onClick={() =>
                      onDraftChange({
                        colorRamp: r.value,
                        categoryColors: buildClassColorsFromRamp(r.value, classes),
                      })
                    }
                  >
                    <span
                      className="si-sym-ramp-card__strip"
                      style={{ backgroundImage: rampCss(r.value) }}
                      aria-hidden
                    />
                    <span className="si-sym-ramp-card__label">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showClasses ? (
            <div className="si-sym-side-field">
              <span className="si-sym-side-label">
                {isUnique ? 'Max categories' : 'Number of classes'}
              </span>
              <div className="si-sym-class-chips">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`si-sym-class-chip${classes === n ? ' si-sym-class-chip--on' : ''}`}
                    onClick={() => {
                      const cats = (symbologyCtx?.categories ?? [])
                        .filter(c => c !== SI_SYMBOLOGY_OTHER_VALUE_KEY)
                        .slice(0, n);
                      const otherFill = draft.categoryColors?.[SI_SYMBOLOGY_OTHER_VALUE_KEY];
                      const rampColors = isUnique
                        ? buildUniqueCategoryColorsFromRamp(draft.colorRamp, cats, draft.categoryColors)
                        : buildClassColorsFromRamp(draft.colorRamp, n);
                      onDraftChange({
                        classes: n,
                        categoryColors:
                          isUnique && otherFill
                            ? { ...rampColors, [SI_SYMBOLOGY_OTHER_VALUE_KEY]: otherFill }
                            : rampColors,
                      });
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showMethod ? (
            <div className="si-sym-side-field">
              <span className="si-sym-side-label">Classification</span>
              <div className="si-sym-method-chips">
                {(
                  [
                    ['jenks', 'Natural breaks'],
                    ['quantile', 'Quantile'],
                    ['equal_interval', 'Equal interval'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`si-sym-method-chip${draft.method === value ? ' si-sym-method-chip--on' : ''}`}
                    onClick={() => onDraftChange({ method: value as SymbologyClassMethod })}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
              <p className="si-sym-side-hint">Each color updates the panel preview until you Apply.</p>
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
              Symbol appearance
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
        </div>

        <div className="si-sym-style-options-foot">
          <button type="button" className="si-sym-style-options-done" onClick={() => setStep('attributes')}>
            Done
          </button>
          <button type="button" className="si-sym-style-options-cancel" onClick={() => setStep('attributes')}>
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div className="si-sym-side-panel__step si-sym-side-step si-sym-side-step--smart">
        <p className="si-sym-side-deferred-hint">
          <i className="fa-solid fa-sliders" aria-hidden /> The map and legend update as you change options. Click{' '}
          <strong>Apply</strong> to save this style to the layer.
        </p>

        {contourSettings && onContourSettingsChange ? (
          <button
            type="button"
            className="si-sym-contour-cls-entry"
            title="Classify terrain contour lines by elevation, slope, and more"
            onClick={() => setStep('contour-classification')}
          >
            <span className="si-sym-contour-cls-entry__icon" aria-hidden>
              <i className="fa-solid fa-chart-area" />
            </span>
            <span className="si-sym-contour-cls-entry__text">
              <strong>Contour classification</strong>
              <span>Classes, ramps, line width, labels</span>
            </span>
            <i className="fa-solid fa-chevron-right si-sym-contour-cls-entry__chev" aria-hidden />
          </button>
        ) : null}

        {allFields.length > 0 ? (
          <div className="si-sym-side-field">
            <label className="si-sym-side-label" htmlFor="si-sym-field-pick">
              Field
            </label>
            <select
              id="si-sym-field-pick"
              className="si-sym-side-select"
              value={draft.field}
              onChange={e => selectField(e.target.value)}
            >
              <option value="">Select a field…</option>
              {allFields.map(f => (
                <option key={f} value={f}>
                  {f} ({fieldKindLabel(fieldKinds[f] ?? 'text')})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {canUseArcGisOnline ? (
          <label className="si-sym-side-toggle si-sym-side-toggle--agol">
            <span>Use ArcGIS Online symbology</span>
            <input
              type="checkbox"
              checked={Boolean(draft.useArcGisOnline)}
              onChange={e => onToggleArcGisOnline(e.target.checked)}
            />
          </label>
        ) : null}

        {draft.useArcGisOnline ? (
          <div className="si-sym-side-banner si-sym-side-banner--agol">
            <strong>ArcGIS renderer selected</strong> — service symbology will apply after you click Apply.
            {(() => {
              const renderer =
                (arcgisDrawingInfo as { renderer?: unknown })?.renderer ??
                (arcgisLayerDefinition as { drawingInfo?: { renderer?: unknown } })?.drawingInfo?.renderer;
              return renderer ? (
                <div style={{ marginTop: 8 }}>{describeArcGisRendererVisualization(renderer)}</div>
              ) : null;
            })()}
            <p className="si-sym-side-hint">Uncheck above to switch to custom Smart Mapping styles.</p>
          </div>
        ) : null}

        {draft.field ? (
          <>
            <div className="si-sym-side-step__head">
              <span className="si-sym-side-step__badge">2</span>
              <div>
                <h3>Pick a style</h3>
                <p>{smartMappingHintForField(activeFieldKind)}</p>
              </div>
            </div>
            <div className="si-sym-style-cards">
              {styleCards.map(opt => {
                const selected = draft.style === opt.value;
                const suggested = opt.value === suggestedStyle;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`si-sym-style-card${selected ? ' si-sym-style-card--on' : ''}${suggested ? ' si-sym-style-card--suggested' : ''}`}
                    onClick={() => pickStyle(opt.value)}
                    disabled={draft.useArcGisOnline}
                  >
                    <div className={`si-sym-style-card__thumb si-sym-style-card__thumb--${STYLE_THUMB[opt.value]}`} />
                    {suggested && !selected ? (
                      <span className="si-sym-style-card__suggest">Suggested</span>
                    ) : null}
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
            {canOpenStyleOptions ? (
              <button type="button" className="si-sym-style-options-btn" onClick={openStyleOptions}>
                Style options
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    );

  const footActions =
    step !== 'symbol-edit' && step !== 'contour-classification' ? (
      <>
        <button type="button" className="si-sym-side-btn" onClick={onReset}>
          Reset to Default
        </button>
        <button type="button" className="si-sym-side-btn si-sym-side-btn--primary" onClick={onApply}>
          Apply
        </button>
      </>
    ) : null;

  return (
    <div
      id="si-layer-action-title"
      className={`si-sym-side-panel${categorySymbolEdit ? ' si-sym-side-panel--with-symbol' : ''}`}
      role="dialog"
      aria-modal="false"
    >
      <header
        className={'si-sym-side-panel__head' + (onHeaderPointerDown ? ' si-sym-side-panel__head--drag' : '')}
        onPointerDown={onHeaderPointerDown}
        title={onHeaderPointerDown ? 'Drag to move' : undefined}
      >
        {showBack ? (
          <button type="button" className="si-sym-side-panel__back" onClick={goBack} aria-label="Back">
            <i className="fa-solid fa-chevron-left" aria-hidden />
          </button>
        ) : null}
        <div className="si-sym-side-panel__brand">
          <i className="fa-solid fa-palette" aria-hidden />
          <div className="si-sym-side-panel__brand-text">
            <h2 className="si-sym-side-panel__title">{headerTitle}</h2>
            <p className="si-sym-side-panel__subtitle" title={layerName}>
              {layerName}
            </p>
          </div>
        </div>
        <button type="button" className="si-sym-side-panel__close" onClick={onClose} aria-label="Cancel and discard changes">
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
        {footActions}
      </footer>
    </div>
  );
}
