import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from './siSymbologyStudioConstants';
import {
  SI_SYM_RAMP_CATEGORY_OPTIONS,
  SiSymbologyLightSelect,
  type SiSymRampCategory,
} from './SiSymbologyLightSelect';
import {
  fieldKindIcon,
  fieldKindLabel,
  getSymbologyStyleCardsForLayer,
  getFieldKindMap,
  inferFieldKind,
  orderStyleCatalogForSuggestions,
  smartMappingHintForField,
  suggestSymbologyStyleForField,
  type SiFieldKind,
} from '../utils/siSymbologySmartMapping';
import {
  resolveSymbologyEngineStyle,
  symbologyStyleAppearancePatch,
  symbologyStyleOptionsSectionTitle,
} from '../utils/siSymbologyStyleResolve';
import { SiSymbologyStyleThumb, SiSymbologyRampStrip } from './SiSymbologyStyleThumb';
import { SiSymbologyInfoIcon } from './SiSymbologyInfoIcon';
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
import { SiCategorySymbolStylePanel } from './SiCategorySymbolStylePanel';
import {
  defaultCategorySymbolStyle,
  resolveCategoryStyleForKey,
} from '../siCategorySymbolStyle';
import { siMapOutlineWidthPreviewPx } from '../utils/siMapOutlineWidthZoom';
import './SiSymbologySidePanel.css';
import {
  SiSymbologyAttributePanels,
  DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION,
  DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY,
} from './SiSymbologyAttributePanels';
import './SiSymbologyAttributePanels.css';

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
  | 'contour-classification'
  | 'ramp-picker';

function styleOptionsSectionTitle(style: SymbologyStyle): string {
  return symbologyStyleOptionsSectionTitle(style);
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
  onDone?: () => void;
  /** Terrain contour classification (global map overlays). */
  contourSettings?: SiMapTerrainSettings;
  onContourSettingsChange?: (patch: Partial<SiMapTerrainSettings>) => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onLayerBarPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  /** Current map zoom — legend swatches and symbol editor previews match on-map outline width. */
  mapZoom?: number;
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

const SI_SYM_RAMP_CATEGORY_MAP: Record<string, SymbologyColorRamp[]> = {
  all: SI_SYMBOLOGY_RAMP_OPTIONS.map(r => r.value),
  light: ['viridis', 'blues', 'greens', 'cividis', 'gray'],
  dark: ['plasma', 'magma', 'inferno', 'turbo'],
  reds: ['inferno', 'plasma', 'spectral'],
  greens: ['greens', 'viridis', 'earth'],
  blues: ['blues', 'cividis'],
  grays: ['gray'],
  bright: ['turbo', 'spectral', 'plasma'],
  subdued: ['earth', 'gray', 'cividis'],
  colorblind: ['viridis', 'cividis', 'blues'],
};

function flipCategoryColorMap(colors: Record<string, string>): Record<string, string> {
  const keys = Object.keys(colors).filter(k => k !== SI_SYMBOLOGY_OTHER_VALUE_KEY);
  if (keys.length < 2) return { ...colors };
  const reversed = keys.map(k => colors[k]!).reverse();
  const out = { ...colors };
  keys.forEach((k, i) => {
    out[k] = reversed[i]!;
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
  contourSettings,
  onContourSettingsChange,
  onHeaderPointerDown,
  onLayerBarPointerDown,
  mapZoom,
}: SiSymbologySidePanelProps) {
  const [step, setStep] = useState<SiSymbologyPanelStep>('attributes');
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [displayByValueOrder, setDisplayByValueOrder] = useState(false);
  const [typesSectionOpen, setTypesSectionOpen] = useState(true);
  const [rampCategory, setRampCategory] = useState<SiSymRampCategory>('all');
  const [symbolEditDraft, setSymbolEditDraft] = useState<SymbologyCategoryStyle | null>(null);
  const symbolEditKeyRef = useRef<string | null>(null);
  const [openAcc, setOpenAcc] = useState({
    appearance: false,
    advanced: false,
    tools: false,
    transparency: false,
    rotation: false,
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

  const engineStyle = resolveSymbologyEngineStyle(draft.style);
  const isUnique =
    engineStyle === 'unique' ||
    draft.style === 'predominance' ||
    draft.style === 'pie_chart' ||
    draft.style === 'donut_chart';
  const isSingle =
    engineStyle === 'single' ||
    draft.style === 'location_only' ||
    draft.style === 'single_fill' ||
    draft.style === 'single_line';
  const classes = clampInt(draft.classes, 2, 12);
  const showColor =
    engineStyle === 'color' ||
    engineStyle === 'color_size' ||
    (isUnique && geometryKind !== 'line');
  const showSize = engineStyle === 'size' || engineStyle === 'color_size' || draft.style === 'width_by_attribute';
  const showMethod =
    isGraduatedSymbologyStyle(draft.style) &&
    draft.style !== 'threshold_markers' &&
    !isSingle &&
    !isUnique;
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
    const hasField = Boolean(draft.field?.trim());
    const filtered = getSymbologyStyleCardsForLayer(activeFieldKind, geometryKind, hasField);
    return hasField
      ? orderStyleCatalogForSuggestions(filtered, suggestedStyle)
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
      const appearancePatch = symbologyStyleAppearancePatch(style);
      if (appearancePatch) {
        onAppearanceChange(appearancePatch);
      }
      const engine = resolveSymbologyEngineStyle(style);
      if (engine === 'unique') {
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
    if (draft.useArcGisOnline || resolveSymbologyEngineStyle(draft.style) !== 'unique' || !symbologyCtx?.categories.length) return;
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

  const filteredRampOptions = useMemo(() => {
    const allowed = SI_SYM_RAMP_CATEGORY_MAP[rampCategory] ?? SI_SYM_RAMP_CATEGORY_MAP.all!;
    const set = new Set(allowed);
    return SI_SYMBOLOGY_RAMP_OPTIONS.filter(r => set.has(r.value));
  }, [rampCategory]);

  const editingSymbolStyle = useMemo((): SymbologyCategoryStyle | null => {
    if (!categorySymbolEdit) return null;
    if (categorySymbolEdit.valueKey === '__si_single_fill') {
      return defaultCategorySymbolStyle(appearance.fillColor || appearance.color || layerColor, {
        outline: appearance.color || layerColor,
        fillOpacity: appearance.polygonFillAlpha,
        outlineWidth: appearance.weight,
      });
    }
    const rampFill =
      symbologyCtx?.categoryColors[categorySymbolEdit.valueKey] ??
      draft.categoryColors?.[categorySymbolEdit.valueKey] ??
      appearance.fillColor ??
      layerColor ??
      '#38bdf8';
    return resolveCategoryStyleForKey(categorySymbolEdit.valueKey, rampFill, draft, {
      fillOpacity: appearance.polygonFillAlpha,
      outlineWidth: appearance.weight,
    });
  }, [
    categorySymbolEdit,
    appearance,
    layerColor,
    symbologyCtx,
    draft,
  ]);

  const handleEditingSymbolStyleChange = useCallback(
    (next: SymbologyCategoryStyle) => {
      if (!categorySymbolEdit) return;
      if (categorySymbolEdit.valueKey === '__si_single_fill') {
        onAppearanceChange({
          fillColor: next.fill,
          color: next.outline,
          polygonFillAlpha: next.fillOpacity,
          weight: next.outlineWidth,
        });
        return;
      }
      onCategoryStyleChange(categorySymbolEdit.valueKey, next);
    },
    [categorySymbolEdit, onAppearanceChange, onCategoryStyleChange],
  );

  useEffect(() => {
    if (!categorySymbolEdit || !editingSymbolStyle) {
      symbolEditKeyRef.current = null;
      setSymbolEditDraft(null);
      return;
    }
    const key = categorySymbolEdit.valueKey;
    if (symbolEditKeyRef.current !== key) {
      symbolEditKeyRef.current = key;
      setSymbolEditDraft(editingSymbolStyle);
    }
  }, [categorySymbolEdit, editingSymbolStyle]);

  const handleSymbolEditDraftChange = useCallback(
    (next: SymbologyCategoryStyle) => {
      setSymbolEditDraft(next);
      handleEditingSymbolStyleChange(next);
    },
    [handleEditingSymbolStyleChange],
  );

  const finishSymbolEdit = useCallback(() => {
    if (!categorySymbolEdit || !symbolEditDraft) return;
    handleEditingSymbolStyleChange(symbolEditDraft);
    onApply?.();
    symbolEditKeyRef.current = null;
    setSymbolEditDraft(null);
    onCategorySymbolEdit(null);
    setStep('style-options');
  }, [
    categorySymbolEdit,
    symbolEditDraft,
    handleEditingSymbolStyleChange,
    onApply,
    onCategorySymbolEdit,
  ]);

  const cancelSymbolEdit = useCallback(() => {
    symbolEditKeyRef.current = null;
    setSymbolEditDraft(null);
    onCategorySymbolEdit(null);
    setStep('style-options');
  }, [onCategorySymbolEdit]);

  const flipRampColors = useCallback(() => {
    const current = draft.categoryColors ?? {};
    if (Object.keys(current).length) {
      onDraftChange({ categoryColors: flipCategoryColorMap(current) });
      return;
    }
    const cats = (symbologyCtx?.categories ?? [])
      .filter(c => c !== SI_SYMBOLOGY_OTHER_VALUE_KEY)
      .slice(0, classes);
    onDraftChange({
      categoryColors: isUnique
        ? flipCategoryColorMap(buildUniqueCategoryColorsFromRamp(draft.colorRamp, cats, draft.categoryColors))
        : flipCategoryColorMap(buildClassColorsFromRamp(draft.colorRamp, classes)),
    });
  }, [
    draft.categoryColors,
    draft.colorRamp,
    symbologyCtx,
    classes,
    isUnique,
    onDraftChange,
  ]);

  const openSymbolEdit = useCallback(
    (valueKey: string, label: string) => {
      onCategorySymbolEdit({ valueKey, label });
    },
    [onCategorySymbolEdit],
  );

  const renderLegendColorRow = (it: SiSymbologyLegendItem, idx: number, opts?: { showCount?: boolean }) => {
    const fillHex = toColorInputHex(it.fill || it.color, '#38bdf8');
    const count =
      it.valueKey && opts?.showCount
        ? it.valueKey === SI_SYMBOLOGY_OTHER_VALUE_KEY
          ? (symbologyCtx?.otherFeatureCount ?? 0)
          : (valueCounts.get(it.valueKey) ?? 0)
        : null;
    const active = it.valueKey && categorySymbolEdit?.valueKey === it.valueKey;
    const isOther = it.valueKey === SI_SYMBOLOGY_OTHER_VALUE_KEY;
    const swatchRound = geometryKind === 'point' || isOther;

    return (
      <div
        key={it.valueKey ?? `${it.label}-${idx}`}
        className={`si-sym-side-value-row${active ? ' si-sym-side-value-row--active' : ''}`}
      >
        {!isOther ? (
          <span className="si-sym-side-value-row__grip" aria-hidden>
            <i className="fa-solid fa-grip-vertical" />
          </span>
        ) : (
          <span aria-hidden />
        )}
        {!isOther ? (
          <input
            type="checkbox"
            className="si-sym-side-value-row__check"
            defaultChecked
            aria-label={`Include ${it.label}`}
          />
        ) : (
          <input
            type="checkbox"
            className="si-sym-side-value-row__check"
            aria-label="Show other values"
          />
        )}
        <button
          type="button"
          className={
            'si-sym-side-value-row__swatch' +
            (swatchRound ? '' : ' si-sym-side-value-row__swatch--square') +
            (geometryKind === 'line' ? ' si-sym-side-value-row__swatch--line' : '')
          }
          style={
            {
              '--si-sym-fill': it.fill || it.color,
              '--si-sym-outline': it.color,
              '--si-sym-outline-w': `${siMapOutlineWidthPreviewPx((it.width ?? appearance.weight) * 0.85, mapZoom)}px`,
              background: geometryKind === 'line' ? '#f3f3f3' : it.fill || it.color,
            } as React.CSSProperties
          }
          title={`Symbol — ${it.label}`}
          aria-label={`Edit symbol for ${it.label}`}
          onClick={() => {
            if (it.valueKey && !isOther) {
              openSymbolEdit(it.valueKey, it.label);
            } else {
              applyLegendFillColor(it, fillHex);
            }
          }}
        />
        <span className="si-sym-side-value-row__label" title={it.label}>
          {it.label}
        </span>
        {count !== null ? <span className="si-sym-side-value-row__count">{count}</span> : null}
        <label className="si-sym-side-value-row__color-field" title="Fill color">
          <input
            type="color"
            className="si-sym-side-value-row__color-input"
            value={fillHex}
            onChange={e => applyLegendFillColor(it, e.target.value)}
            aria-label={`Fill color for ${it.label}`}
          />
        </label>
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
          : step === 'ramp-picker'
            ? 'Ramp'
            : 'Styles';

  const showBack =
    step === 'style-options' ||
    step === 'symbol-edit' ||
    step === 'contour-classification' ||
    step === 'ramp-picker';

  const goBack = () => {
    if (step === 'contour-classification') {
      setStep('attributes');
      return;
    }
    if (step === 'ramp-picker') {
      setStep('style-options');
      return;
    }
    if (step === 'symbol-edit') {
      cancelSymbolEdit();
      return;
    }
    if (step === 'style-options') {
      setStep('attributes');
    }
  };

  const commitAndClose = () => {
    onApply();
    onClose();
  };

  const openStyleOptions = () => setStep('style-options');

  const canOpenStyleOptions =
    !draft.useArcGisOnline && (Boolean(draft.field?.trim()) || isSingle);

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
        <footer className="si-sym-side-panel__foot si-sym-side-panel__foot--agol si-sym-side-panel__foot--agol-custom">
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
    ) : step === 'symbol-edit' && categorySymbolEdit && symbolEditDraft ? (
      <div className="si-sym-side-panel__step si-sym-side-step si-sym-side-step--symbol-edit">
        <SiCategorySymbolStylePanel
          embedded
          categoryLabel={categorySymbolEdit.label}
          style={symbolEditDraft}
          geometryKind={
            geometryKind === 'point' || geometryKind === 'line' ? geometryKind : 'polygon'
          }
          previewCornerRadius={appearance.previewCornerRadius}
          mapZoom={mapZoom}
          onChange={handleSymbolEditDraftChange}
          onClose={cancelSymbolEdit}
        />
        <div className="si-sym-style-options-foot si-sym-style-options-foot--symbol-edit">
          <button type="button" className="si-sym-style-options-done" onClick={finishSymbolEdit}>
            Done
          </button>
        </div>
      </div>
    ) : step === 'ramp-picker' ? (
      <div className="si-sym-side-panel__step si-sym-side-step si-sym-side-step--options">
        <SiSymbologyLightSelect
          id="si-sym-ramp-category"
          label="Category"
          value={rampCategory}
          options={[...SI_SYM_RAMP_CATEGORY_OPTIONS]}
          onChange={v => setRampCategory(v || 'all')}
          className="si-sym-ramp-picker__category"
        />
        <button type="button" className="si-sym-ramp-picker__flip" onClick={flipRampColors}>
          <i className="fa-solid fa-arrows-up-down" aria-hidden /> Flip ramp colors
        </button>
        <div className="si-sym-ramp-grid">
          {filteredRampOptions.map(r => (
            <button
              key={r.value}
              type="button"
              className={`si-sym-ramp-grid__cell${draft.colorRamp === r.value ? ' si-sym-ramp-grid__cell--on' : ''}`}
              title={r.label}
              onClick={() => {
                const cats = (symbologyCtx?.categories ?? [])
                  .filter(c => c !== SI_SYMBOLOGY_OTHER_VALUE_KEY)
                  .slice(0, classes);
                onDraftChange({
                  colorRamp: r.value,
                  categoryColors: isUnique
                    ? buildUniqueCategoryColorsFromRamp(r.value, cats, draft.categoryColors)
                    : buildClassColorsFromRamp(r.value, classes),
                });
              }}
            >
              <span
                className="si-sym-ramp-grid__cell-inner"
                style={{ backgroundImage: rampCss(r.value) }}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <div className="si-sym-style-options-foot">
          <button type="button" className="si-sym-style-options-done" onClick={() => setStep('style-options')}>
            Done
          </button>
        </div>
      </div>
    ) : step === 'style-options' && canOpenStyleOptions ? (
      <div className="si-sym-side-panel__step si-sym-side-step si-sym-side-step--options">
        <div className="si-sym-side-style-section">
          <button
            type="button"
            className="si-sym-side-style-section__title"
            onClick={() => setTypesSectionOpen(open => !open)}
          >
            {styleOptionsSectionTitle(draft.style)}
            <i className={`fa-solid fa-chevron-${typesSectionOpen ? 'up' : 'down'}`} aria-hidden />
          </button>

          {typesSectionOpen ? (
            <>
              {showColor ? (
                <div className="si-sym-side-symbol-strip">
                  <span className="si-sym-side-symbol-strip__label">Symbol style</span>
                  <SiSymbologyRampStrip rampCss={rampCss(draft.colorRamp)} />
                  <button
                    type="button"
                    className="si-sym-side-symbol-strip__edit"
                    title="Edit color scheme"
                    onClick={() => setStep('ramp-picker')}
                  >
                    <i className="fa-solid fa-pen" aria-hidden />
                  </button>
                </div>
              ) : isSingle ? (
                <div className="si-sym-side-symbol-strip">
                  <span className="si-sym-side-symbol-strip__label">Symbol style</span>
                  <span
                    className="si-sym-side-symbol-strip__swatch"
                    style={{ background: appearance.fillColor || appearance.color }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="si-sym-side-symbol-strip__edit"
                    title="Edit symbol style"
                    aria-label="Edit symbol style"
                    onClick={() => openSymbolEdit('__si_single_fill', layerName)}
                  >
                    <i className="fa-solid fa-pen" aria-hidden />
                  </button>
                </div>
              ) : isUnique ? (
                <div className="si-sym-side-symbol-strip">
                  <span className="si-sym-side-symbol-strip__label">Symbol style</span>
                  <span className="si-sym-side-symbol-strip__ramp si-sym-style-card__thumb--unique" aria-hidden />
                </div>
              ) : null}

              {isUnique ? (
                <label className="si-sym-agol-toggle-row">
                  <span>Display features by value order</span>
                  <input
                    type="checkbox"
                    checked={displayByValueOrder}
                    onChange={e => setDisplayByValueOrder(e.target.checked)}
                  />
                </label>
              ) : null}

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
              <div className="si-sym-side-value-list">
                <div className="si-sym-side-value-list__head">
                  <span className="si-sym-side-value-list__head-grip" aria-hidden>
                    <i className="fa-solid fa-grip-vertical" />
                  </span>
                  <span>{draft.field?.toUpperCase() ?? 'VALUE'}</span>
                  <span>{uniqueValueCount}</span>
                  <button type="button" className="si-sym-side-value-list__menu" aria-label="More options">
                    <i className="fa-solid fa-ellipsis-vertical" aria-hidden />
                  </button>
                </div>
                {legendItems.map((it, idx) => renderLegendColorRow(it, idx, { showCount: true }))}
              </div>
            </div>
          ) : (
            <div className="si-sym-side-field">
              <div className="si-sym-side-value-list">
                {legendItems.map((it, idx) => renderLegendColorRow(it, idx))}
              </div>
            </div>
          )}

          <SiSymbologyAttributePanels
            geojson={geojson}
            allFields={allFields}
            numericFields={numericFields}
            defaultField={draft.field}
            transparency={draft.attributeTransparency ?? DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY}
            rotation={draft.attributeRotation ?? DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION}
            transparencyOpen={openAcc.transparency}
            rotationOpen={openAcc.rotation}
            onTransparencyOpenChange={open =>
              setOpenAcc(a => ({ ...a, transparency: open }))
            }
            onRotationOpenChange={open => setOpenAcc(a => ({ ...a, rotation: open }))}
            onTransparencyChange={attributeTransparency => onDraftChange({ attributeTransparency })}
            onRotationChange={attributeRotation => onDraftChange({ attributeRotation })}
          />
            </>
          ) : null}
        </div>

        <div className="si-sym-style-options-foot">
          <button type="button" className="si-sym-style-options-done" onClick={commitAndClose}>
            Done
          </button>
          <button type="button" className="si-sym-style-options-cancel" onClick={() => setStep('attributes')}>
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div className="si-sym-side-panel__step si-sym-side-step si-sym-side-step--styles">
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

        {!draft.useArcGisOnline ? (
          <>
            <div className="si-sym-side-step__head">
              <span className="si-sym-side-step__badge">1</span>
              <h3>
                Choose attributes
                <SiSymbologyInfoIcon
                  className="si-sym-side-step__info"
                  title="Pick a field to drive color, size, or category symbols."
                />
              </h3>
            </div>

            {draft.field ? (
              <div className="si-sym-side-field-chip">
                <span className="si-sym-side-field-chip__icon" aria-hidden>
                  {fieldKindIcon(activeFieldKind)}
                </span>
                <span className="si-sym-side-field-chip__name">{draft.field}</span>
                <button
                  type="button"
                  className="si-sym-side-field-chip__remove"
                  onClick={() => selectField('')}
                  aria-label={`Remove field ${draft.field}`}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            ) : null}

            <div className="si-sym-side-field-actions">
              <button
                type="button"
                className="si-sym-side-field-actions__btn"
                onClick={() => setFieldPickerOpen(open => !open)}
              >
                <i className="fa-solid fa-plus" aria-hidden /> Field
              </button>
              <button type="button" className="si-sym-side-field-actions__btn" disabled title="Coming soon">
                <i className="fa-solid fa-plus" aria-hidden /> Expression
              </button>
            </div>

            {fieldPickerOpen && allFields.length > 0 ? (
              <div className="si-sym-side-field si-sym-side-field-picker">
                <button
                  type="button"
                  className="si-sym-side-field-picker__trigger"
                  aria-expanded
                  aria-controls="si-sym-field-pick-list"
                  onClick={() => setFieldPickerOpen(false)}
                >
                  <span>
                    {draft.field
                      ? `${draft.field} (${fieldKindLabel(fieldKinds[draft.field] ?? activeFieldKind)})`
                      : 'Select a field…'}
                  </span>
                  <i className="fa-solid fa-chevron-up" aria-hidden />
                </button>
                <ul id="si-sym-field-pick-list" className="si-sym-side-field-picker__list" role="listbox">
                  {allFields.map(f => {
                    const on = draft.field === f;
                    return (
                      <li key={f} role="option" aria-selected={on}>
                        <button
                          type="button"
                          className={
                            'si-sym-side-field-picker__item' + (on ? ' si-sym-side-field-picker__item--on' : '')
                          }
                          onClick={() => {
                            selectField(f);
                            setFieldPickerOpen(false);
                          }}
                        >
                          {f} ({fieldKindLabel(fieldKinds[f] ?? 'text')})
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {styleCards.length > 0 ? (
              <>
                <div className="si-sym-side-step__head si-sym-side-step__head--2">
                  <span className="si-sym-side-step__badge">2</span>
                  <h3>Pick a style</h3>
                  <p>{smartMappingHintForField(activeFieldKind, geometryKind)}</p>
                </div>
                <div className="si-sym-style-cards si-sym-style-cards--agol">
                  {styleCards.map(opt => {
                    const selected = draft.style === opt.value;
                    const suggested = opt.value === suggestedStyle;
                    return (
                      <div
                        key={opt.value}
                        className={`si-sym-style-card-wrap${selected ? ' si-sym-style-card-wrap--on' : ''}`}
                      >
                        <button
                          type="button"
                          className={`si-sym-style-card si-sym-style-card--agol${selected ? ' si-sym-style-card--on' : ''}${suggested ? ' si-sym-style-card--suggested' : ''}`}
                          onClick={() => pickStyle(opt.value)}
                        >
                          <div className="si-sym-style-card__preview">
                            <SiSymbologyStyleThumb thumb={opt.thumb} />
                            <span
                              className={`si-sym-style-card__check${selected ? ' si-sym-style-card__check--on' : ''}`}
                              aria-hidden
                            >
                              {selected ? <i className="fa-solid fa-check" /> : null}
                            </span>
                          </div>
                          <div className="si-sym-style-card__meta">
                            <div className="si-sym-style-card__title">
                              {opt.label}
                              <SiSymbologyInfoIcon title={opt.hint} />
                            </div>
                          </div>
                        </button>
                        {selected && canOpenStyleOptions ? (
                          <button type="button" className="si-sym-style-options-btn" onClick={openStyleOptions}>
                            Style options
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    );

  const isSubStep = step === 'style-options' || step === 'ramp-picker' || step === 'symbol-edit';
  const showMainFoot = !isSubStep && step !== 'contour-classification';

  return (
    <div
      id="si-layer-action-title"
      className={`si-sym-side-panel${categorySymbolEdit ? ' si-sym-side-panel--with-symbol' : ''}`}
      role="dialog"
      aria-modal="false"
    >
      <div
        className={
          'si-sym-side-panel__layer-bar' +
          (onLayerBarPointerDown ? ' si-sym-side-panel__layer-bar--drag' : '')
        }
        title={onLayerBarPointerDown ? layerName : undefined}
        onPointerDown={onLayerBarPointerDown}
      >
        <span className="si-sym-side-panel__layer-name">{layerName}</span>
        <i className="fa-solid fa-chevron-down si-sym-side-panel__layer-chev" aria-hidden />
      </div>
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
          <div className="si-sym-side-panel__brand-text">
            <h2 className="si-sym-side-panel__title">{headerTitle}</h2>
          </div>
        </div>
        <button type="button" className="si-sym-side-panel__close" onClick={onClose} aria-label="Cancel and discard changes">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="si-sym-side-panel__body">{body}</div>
      {showMainFoot ? (
        <footer
          className={
            'si-sym-side-panel__foot si-sym-side-panel__foot--agol' +
            (draft.useArcGisOnline ? '' : ' si-sym-side-panel__foot--agol-custom')
          }
        >
          {draft.useArcGisOnline ? (
            <>
              <div className="si-sym-agol-foot-row">
                <button type="button" className="si-sym-side-btn si-sym-side-btn--done" onClick={commitAndClose}>
                  Done
                </button>
                <button type="button" className="si-sym-side-btn si-sym-side-btn--cancel" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="si-sym-side-btn si-sym-side-btn--reset" onClick={onReset}>
                  Reset to Default
                </button>
              </div>
              <button type="button" className="si-sym-agol-apply" onClick={onApply}>
                Apply
              </button>
            </>
          ) : (
            <>
              <button type="button" className="si-sym-side-btn si-sym-side-btn--done" onClick={commitAndClose}>
                Done
              </button>
              <button type="button" className="si-sym-side-btn si-sym-side-btn--cancel" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </footer>
      ) : null}
    </div>
  );
}
