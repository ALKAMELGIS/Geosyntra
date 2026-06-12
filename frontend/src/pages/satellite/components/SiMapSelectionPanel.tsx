import { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/lib/i18n';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import type {
  SiMapSelectionEntry,
  SiMapSelectionSummary,
  SiMapSelectionTool,
  SiSelectionMergeMode,
} from '../utils/siMapFeatureSelection';
import './SiMapSelectionPanel.css';

export const SI_MAP_SELECTION_PANEL_WIDTH = 320;
const SI_MAP_SELECTION_PANEL_HEIGHT = 560;

export type SiMapSelectionPanelProps = {
  open: boolean;
  tool: SiMapSelectionTool;
  mergeMode: SiSelectionMergeMode;
  entries: SiMapSelectionEntry[];
  summary: SiMapSelectionSummary;
  onClose: () => void;
  onToolChange: (tool: SiMapSelectionTool) => void;
  onMergeModeChange: (mode: SiSelectionMergeMode) => void;
  onClear: () => void;
  onInvert: () => void;
  onSelectAll: () => void;
  onZoomTo: () => void;
  onFlash: () => void;
  onOpenTable: () => void;
  onExportCsv: () => void;
  onExportGeoJson: () => void;
  attributeField?: string;
  attributeValue?: string;
  onAttributeField?: (v: string) => void;
  onAttributeValue?: (v: string) => void;
  onApplyAttribute?: () => void;
  spatialRelation?: string;
  onSpatialRelation?: (v: string) => void;
  onApplySpatial?: () => void;
  onFinishSketch?: () => void;
};

type ToolDef = { id: SiMapSelectionTool; icon: string; labelEn: string; labelAr: string };

const SELECT_TOOLS: ToolDef[] = [
  { id: 'click', icon: 'fa-arrow-pointer', labelEn: 'Click', labelAr: 'نقر' },
  { id: 'rectangle', icon: 'fa-vector-square', labelEn: 'Rectangle', labelAr: 'مستطيل' },
  { id: 'polygon', icon: 'fa-draw-polygon', labelEn: 'Polygon', labelAr: 'مضلع' },
  { id: 'circle', icon: 'fa-circle', labelEn: 'Circle', labelAr: 'دائرة' },
  { id: 'lasso', icon: 'fa-bezier-curve', labelEn: 'Lasso', labelAr: 'حر' },
  { id: 'line', icon: 'fa-minus', labelEn: 'Line', labelAr: 'خط' },
  { id: 'extent', icon: 'fa-expand', labelEn: 'Extent', labelAr: 'النطاق المرئي' },
  { id: 'attribute', icon: 'fa-filter', labelEn: 'Attribute', labelAr: 'حسب الحقل' },
  { id: 'spatial', icon: 'fa-object-group', labelEn: 'Spatial', labelAr: 'علاقة مكانية' },
];

function t(lang: string | undefined, en: string, ar: string): string {
  return lang === 'ar' ? ar : en;
}

export function SiMapSelectionPanel({
  open,
  tool,
  mergeMode,
  entries,
  summary,
  onClose,
  onToolChange,
  onMergeModeChange,
  onClear,
  onInvert,
  onSelectAll,
  onZoomTo,
  onFlash,
  onOpenTable,
  onExportCsv,
  onExportGeoJson,
  attributeField = '',
  attributeValue = '',
  onAttributeField,
  onAttributeValue,
  onApplyAttribute,
  spatialRelation = 'intersects',
  onSpatialRelation,
  onApplySpatial,
  onFinishSketch,
}: SiMapSelectionPanelProps) {
  const { direction, language } = useLanguage();
  const dir = direction;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panelStyle: dragPanelStyle, onHeaderPointerDown } = useDraggablePanel({
    storageKey: 'si-map-selection-panel-pos-v1',
    panelWidth: SI_MAP_SELECTION_PANEL_WIDTH,
    panelHeight: SI_MAP_SELECTION_PANEL_HEIGHT,
    defaultAnchor: 'right',
    defaultVerticalBias: -24,
  });

  const activeToolLabel = useMemo(
    () => SELECT_TOOLS.find(x => x.id === tool)?.[language === 'ar' ? 'labelAr' : 'labelEn'] ?? tool,
    [tool, language],
  );

  if (!open) return null;

  const panel = (
    <div
      ref={panelRef}
      className="si-map-selection-panel"
      style={dragPanelStyle}
      dir={dir}
      role="dialog"
      aria-modal="false"
      aria-label={t(language, 'Feature selection', 'تحديد المعالم')}
    >
      <header
        className="si-map-selection-panel__head"
        onPointerDown={onHeaderPointerDown}
        title={t(language, 'Drag to move', 'اسحب للتحريك')}
      >
        <div className="si-map-selection-panel__title-row">
          <i className="fa-solid fa-object-ungroup si-map-selection-panel__title-icon" aria-hidden />
          <div>
            <h3 className="si-map-selection-panel__title">{t(language, 'Selection', 'تحديد')}</h3>
            <p className="si-map-selection-panel__subtitle">
              {tool === 'off'
                ? t(language, 'Choose a selection tool', 'اختر أداة التحديد')
                : t(language, `Active: ${activeToolLabel}`, `الأداة: ${activeToolLabel}`)}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="si-map-selection-panel__close"
          onClick={onClose}
          aria-label={t(language, 'Close', 'إغلاق')}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-map-selection-panel__scroll">
        <section className="si-map-selection-panel__section">
          <h4 className="si-map-selection-panel__section-title">{t(language, 'Select by', 'تحديد بواسطة')}</h4>
          <div className="si-map-selection-panel__tool-grid" role="toolbar">
            {SELECT_TOOLS.map(td => (
              <button
                key={td.id}
                type="button"
                className={'si-map-selection-panel__tool' + (tool === td.id ? ' si-map-selection-panel__tool--on' : '')}
                title={language === 'ar' ? td.labelAr : td.labelEn}
                aria-pressed={tool === td.id}
                onClick={() => onToolChange(tool === td.id ? 'off' : td.id)}
              >
                <i className={`fa-solid ${td.icon}`} aria-hidden />
                <span>{language === 'ar' ? td.labelAr : td.labelEn}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="si-map-selection-panel__section">
          <h4 className="si-map-selection-panel__section-title">{t(language, 'Selection mode', 'وضع التحديد')}</h4>
          <div className="si-map-selection-panel__mode-row" role="group">
            {(
              [
                ['replace', 'Select only', 'استبدال'],
                ['add', 'Add', 'إضافة'],
                ['remove', 'Remove', 'إزالة'],
              ] as const
            ).map(([mode, en, ar]) => (
              <button
                key={mode}
                type="button"
                className={'si-map-selection-panel__mode' + (mergeMode === mode ? ' si-map-selection-panel__mode--on' : '')}
                aria-pressed={mergeMode === mode}
                onClick={() => onMergeModeChange(mode)}
              >
                {t(language, en, ar)}
              </button>
            ))}
          </div>
          <div className="si-map-selection-panel__mgmt-row">
            <button type="button" className="si-map-selection-panel__mgmt" onClick={onSelectAll}>
              {t(language, 'Select all', 'تحديد الكل')}
            </button>
            <button type="button" className="si-map-selection-panel__mgmt" onClick={onInvert} disabled={!entries.length}>
              {t(language, 'Invert', 'عكس')}
            </button>
            <button type="button" className="si-map-selection-panel__mgmt" onClick={onClear} disabled={!entries.length}>
              {t(language, 'Clear', 'مسح')}
            </button>
          </div>
        </section>

        {tool === 'attribute' ? (
          <section className="si-map-selection-panel__section si-map-selection-panel__filter">
            <h4 className="si-map-selection-panel__section-title">{t(language, 'Attribute filter', 'تصفية حسب الحقل')}</h4>
            <input
              className="si-map-selection-panel__input"
              placeholder={t(language, 'Field name', 'اسم الحقل')}
              value={attributeField}
              onChange={e => onAttributeField?.(e.target.value)}
            />
            <input
              className="si-map-selection-panel__input"
              placeholder={t(language, 'Contains value', 'القيمة')}
              value={attributeValue}
              onChange={e => onAttributeValue?.(e.target.value)}
            />
            <button type="button" className="si-map-selection-panel__apply" onClick={onApplyAttribute}>
              {t(language, 'Apply filter', 'تطبيق')}
            </button>
          </section>
        ) : null}

        {tool === 'spatial' ? (
          <section className="si-map-selection-panel__section si-map-selection-panel__filter">
            <h4 className="si-map-selection-panel__section-title">
              {t(language, 'Spatial relationship', 'علاقة مكانية')}
            </h4>
            <select
              className="si-map-selection-panel__input"
              value={spatialRelation}
              onChange={e => onSpatialRelation?.(e.target.value)}
            >
              <option value="intersects">{t(language, 'Intersects', 'تقاطع')}</option>
              <option value="within">{t(language, 'Within', 'داخل')}</option>
              <option value="contains">{t(language, 'Contains', 'يحتوي')}</option>
              <option value="touches">{t(language, 'Touches', 'مجاور')}</option>
            </select>
            <button type="button" className="si-map-selection-panel__apply" onClick={onApplySpatial}>
              {t(language, 'Use drawn AOI', 'استخدام AOI')}
            </button>
          </section>
        ) : null}

        {tool === 'polygon' ? (
          <section className="si-map-selection-panel__section">
            <p className="si-map-selection-panel__hint">
              {t(language, 'Click vertices on the map, then finish.', 'انقر رؤوس المضلع على الخريطة ثم أنهِ.')}
            </p>
            <button type="button" className="si-map-selection-panel__apply" onClick={onFinishSketch}>
              {t(language, 'Finish polygon', 'إنهاء المضلع')}
            </button>
          </section>
        ) : null}

        {summary.total > 0 ? (
          <section className="si-map-selection-panel__results" aria-live="polite">
            <div className="si-map-selection-panel__stat-main">
              <span className="si-map-selection-panel__stat-count">{summary.total}</span>
              <span className="si-map-selection-panel__stat-label">{t(language, 'features selected', 'معلم محدد')}</span>
            </div>
            {summary.layerCounts.length > 0 ? (
              <ul className="si-map-selection-panel__layers">
                {summary.layerCounts.map(l => (
                  <li key={l.layerId}>
                    <span>{l.layerName}</span>
                    <span className="si-map-selection-panel__layer-count">{l.count}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {summary.totalAreaHa != null ? (
              <p className="si-map-selection-panel__metric">
                {t(language, 'Total area', 'المساحة')}: <strong dir="ltr">{summary.totalAreaHa.toFixed(2)} ha</strong>
              </p>
            ) : null}
            {summary.totalLengthKm != null ? (
              <p className="si-map-selection-panel__metric">
                {t(language, 'Total length', 'الطول')}: <strong dir="ltr">{summary.totalLengthKm.toFixed(2)} km</strong>
              </p>
            ) : null}
            {summary.numericStats.length > 0 ? (
              <div className="si-map-selection-panel__num-stats">
                {summary.numericStats.slice(0, 3).map(s => (
                  <div key={s.field} className="si-map-selection-panel__num-row">
                    <span>{s.field}</span>
                    <span dir="ltr">
                      {s.avg.toFixed(2)} <small>({s.min.toFixed(1)}–{s.max.toFixed(1)})</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <p className="si-map-selection-panel__empty">
            {t(language, 'Select features on the map to see results here.', 'حدّد معالمًا على الخريطة لعرض النتائج.')}
          </p>
        )}
      </div>

      <footer className="si-map-selection-panel__actions">
        <button type="button" className="si-map-selection-panel__action" onClick={onZoomTo} disabled={!entries.length}>
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
          {t(language, 'Zoom', 'تكبير')}
        </button>
        <button type="button" className="si-map-selection-panel__action" onClick={onFlash} disabled={!entries.length}>
          <i className="fa-solid fa-bolt" aria-hidden />
          {t(language, 'Flash', 'وميض')}
        </button>
        <button type="button" className="si-map-selection-panel__action" onClick={onOpenTable} disabled={!entries.length}>
          <i className="fa-solid fa-table" aria-hidden />
          {t(language, 'Table', 'جدول')}
        </button>
        <button type="button" className="si-map-selection-panel__action" onClick={onExportCsv} disabled={!entries.length}>
          <i className="fa-solid fa-file-csv" aria-hidden />
          CSV
        </button>
        <button type="button" className="si-map-selection-panel__action" onClick={onExportGeoJson} disabled={!entries.length}>
          <i className="fa-solid fa-file-export" aria-hidden />
          GeoJSON
        </button>
      </footer>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
}
