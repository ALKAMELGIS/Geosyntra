import {

  useCallback,

  useEffect,

  useMemo,

  useState,

  type RefObject,

} from 'react';

import { createPortal } from 'react-dom';

import { useLanguage } from '@/lib/i18n';

import { SiStatDashboardIcon } from './SiStatDashboardIcon';

import { siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';

import { useSiFloatingResizableCard } from '../hooks/useSiFloatingResizableCard';

import {
  buildQuickDashboard,
  exportQuickDashboardCsv,
} from '../utils/siQuickDashboardEngine';

import {

  applyQuickDashboardCrossFilter,

  describeQuickDashboardCrossFilter,

  toggleQuickDashboardCrossFilter,

  type SiQuickCrossFilter,

} from '../utils/siQuickDashboardCrossFilter';

import { getQuickDashboardTheme } from '../utils/siQuickDashboardTheme';

import {

  filterFeaturesForQuickDashboard,

  type SiQuickDashboardScopeMode,

} from '../utils/siQuickDashboardScope';

import { WidgetBodyPro, chartKindLabel, type SiQuickChartFilterHandlers } from './SiQuickDashboardCharts';
import { SiQuickDashboardFieldPicker } from './SiQuickDashboardFieldPicker';

import './SiQuickDashboardPanel.css';



export type SiQuickDashboardLayerOption = {

  id: string;

  name: string;

  features: GeoJSON.Feature[];

};



export type SiQuickDashboardPanelProps = {

  open: boolean;

  onClose: () => void;

  layers: SiQuickDashboardLayerOption[];

  mapRef: RefObject<{ getMap?: () => unknown } | null>;

  mapLoaded: boolean;

  aoiFeature?: GeoJSON.Feature | null;

  selectedFeatureKeys?: Set<string>;

  keyForFeature?: (feature: GeoJSON.Feature, index: number) => string;

  dir?: 'rtl' | 'ltr';

  language?: string;

};



const QDASH_LAYOUT_LS = 'si-qdash-card-layout-v2';

const QDASH_WIDGET_ORDER_LS = 'si-qdash-widget-order-v1';



function defaultQdashSize() {

  if (typeof window === 'undefined') return { w: 480, h: 640 };

  return {

    w: Math.min(520, Math.max(380, Math.round(window.innerWidth * 0.32))),

    h: Math.min(780, Math.max(480, Math.round(window.innerHeight * 0.68))),

  };

}



function defaultQdashPosition(size: { w: number; h: number }) {

  return siMapLeftPopoutFixedPosition('quick-dashboard', size.h);

}



function t(lang: string | undefined, en: string, ar: string): string {

  return lang === 'ar' ? ar : en;

}



function readWidgetOrder(): string[] {

  try {

    const raw = localStorage.getItem(QDASH_WIDGET_ORDER_LS);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];

  } catch {

    return [];

  }

}



function writeWidgetOrder(ids: string[]) {

  try {

    localStorage.setItem(QDASH_WIDGET_ORDER_LS, JSON.stringify(ids));

  } catch {

    /* ignore */

  }

}



export function SiQuickDashboardPanel({

  open,

  onClose,

  layers,

  mapRef,

  mapLoaded,

  aoiFeature,

  selectedFeatureKeys,

  keyForFeature,

  dir: dirProp,

  language: languageProp,

}: SiQuickDashboardPanelProps) {

  const { direction, language: ctxLanguage } = useLanguage();

  const dir = dirProp ?? direction;

  const language = languageProp ?? ctxLanguage;

  const [layerId, setLayerId] = useState('');

  const [pickedFields, setPickedFields] = useState<Set<string>>(new Set());

  const [scope, setScope] = useState<SiQuickDashboardScopeMode>('viewport');

  const [phase, setPhase] = useState<'setup' | 'live'>('setup');

  const [mapTick, setMapTick] = useState(0);

  const [crossFilter, setCrossFilter] = useState<SiQuickCrossFilter>(null);

  const [widgetOrder, setWidgetOrder] = useState<string[]>(readWidgetOrder);

  const [dragWidgetId, setDragWidgetId] = useState<string | null>(null);



  const {

    panelRef,

    panelStyle,

    dragging,

    resizing,

    resetLayout,

    onDragPointerDown,

    onDragPointerMove,

    endDrag,

    onResizePointerDown,

    resizeHandles,

  } = useSiFloatingResizableCard({

    storageKey: QDASH_LAYOUT_LS,

    enabled: open,

    defaultSize: defaultQdashSize,

    defaultPosition: defaultQdashPosition,

    minSize: { w: 340, h: 400 },

  });



  const layer = useMemo(() => layers.find(l => l.id === layerId) ?? layers[0] ?? null, [layers, layerId]);



  useEffect(() => {

    if (!open) return;

    if (layers.length && !layerId) setLayerId(layers[0]!.id);

  }, [open, layers, layerId]);



  useEffect(() => {

    if (!open) {

      setPhase('setup');

      setPickedFields(new Set());

      setCrossFilter(null);

    }

  }, [open]);



  useEffect(() => {

    setCrossFilter(null);

  }, [scope, layerId]);



  const mapBounds = useMemo(() => {

    void mapTick;

    if (!mapLoaded) return null;

    const map = mapRef.current?.getMap?.() as {

      getBounds?: () => {

        getWest: () => number;

        getSouth: () => number;

        getEast: () => number;

        getNorth: () => number;

      };

    } | undefined;

    if (!map?.getBounds) return null;

    const b = map.getBounds();

    return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };

  }, [mapLoaded, mapRef, mapTick]);



  useEffect(() => {

    if (!open || !mapLoaded) return;

    const map = mapRef.current?.getMap?.() as {

      on?: (e: string, fn: () => void) => void;

      off?: (e: string, fn: () => void) => void;

    } | undefined;

    if (!map?.on) return;

    const bump = () => setMapTick(t => t + 1);

    map.on('move', bump);

    map.on('moveend', bump);

    map.on('zoomend', bump);

    return () => {

      map.off?.('move', bump);

      map.off?.('moveend', bump);

      map.off?.('zoomend', bump);

    };

  }, [open, mapLoaded, mapRef]);



  const scopedFeatures = useMemo(() => {

    if (!layer?.features.length) return [];

    return filterFeaturesForQuickDashboard({

      features: layer.features,

      mode: scope,

      bounds: mapBounds,

      aoi: aoiFeature,

      selectedKeys: selectedFeatureKeys,

      keyForFeature,

    });

  }, [layer, scope, mapBounds, aoiFeature, selectedFeatureKeys, keyForFeature]);



  const filteredFeatures = useMemo(

    () => applyQuickDashboardCrossFilter(scopedFeatures, crossFilter),

    [scopedFeatures, crossFilter],

  );



  const dashboard = useMemo(() => {

    if (phase !== 'live' || !filteredFeatures.length) return null;

    const keys = [...pickedFields];

    return buildQuickDashboard(filteredFeatures, keys.length ? keys : []);

  }, [phase, filteredFeatures, pickedFields]);



  const theme = useMemo(

    () => getQuickDashboardTheme(dashboard?.themeId ?? 'emerald'),

    [dashboard?.themeId],

  );



  const orderedWidgets = useMemo(() => {

    if (!dashboard) return [];

    const byId = new Map(dashboard.widgets.map(w => [w.id, w]));

    const ordered: typeof dashboard.widgets = [];

    for (const id of widgetOrder) {

      const w = byId.get(id);

      if (w) {

        ordered.push(w);

        byId.delete(id);

      }

    }

    for (const w of dashboard.widgets) {

      if (byId.has(w.id)) ordered.push(w);

    }

    return ordered;

  }, [dashboard, widgetOrder]);



  useEffect(() => {

    if (!dashboard) return;

    const ids = orderedWidgets.map(w => w.id);

    writeWidgetOrder(ids);

  }, [dashboard, orderedWidgets]);



  const fieldMetas = useMemo(

    () => (layer ? buildQuickDashboard(layer.features.slice(0, 500), []).fields : []),

    [layer],

  );



  const toggleField = useCallback((key: string) => {
    setPickedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectFields = useCallback((keys: string[]) => {
    setPickedFields(new Set(keys));
  }, []);

  const clearFields = useCallback(() => {
    setPickedFields(new Set());
  }, []);



  const onCategorySelect = useCallback((field: string, value: string, widgetId: string) => {

    setCrossFilter(prev =>

      toggleQuickDashboardCrossFilter(prev, { type: 'equals', field, value, sourceWidgetId: widgetId }),

    );

  }, []);



  const onRangeSelect = useCallback((field: string, from: string, to: string, widgetId: string) => {

    setCrossFilter(prev =>

      toggleQuickDashboardCrossFilter(prev, { type: 'range', field, from, to, sourceWidgetId: widgetId }),

    );

  }, []);



  const chartHandlers: SiQuickChartFilterHandlers = useMemo(

    () => ({ crossFilter, onCategorySelect, onRangeSelect }),

    [crossFilter, onCategorySelect, onRangeSelect],

  );



  const exportCsv = () => {

    if (!dashboard) return;

    const blob = new Blob([exportQuickDashboardCsv(dashboard)], { type: 'text/csv;charset=utf-8' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = `quick-dashboard-${layer?.name ?? 'layer'}.csv`;

    a.click();

    URL.revokeObjectURL(url);

  };



  const onWidgetDragStart = (id: string) => setDragWidgetId(id);



  const onWidgetDragOver = (e: React.DragEvent, overId: string) => {

    e.preventDefault();

    if (!dragWidgetId || dragWidgetId === overId) return;

    setWidgetOrder(prev => {

      const ids = orderedWidgets.map(w => w.id);

      const from = ids.indexOf(dragWidgetId);

      const to = ids.indexOf(overId);

      if (from < 0 || to < 0) return prev;

      const next = [...ids];

      next.splice(from, 1);

      next.splice(to, 0, dragWidgetId);

      return next;

    });

  };



  useEffect(() => {

    if (!open) return;

    const onKey = (e: KeyboardEvent) => {

      if (e.key === 'Escape') onClose();

    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);

  }, [open, onClose]);



  const onHeadDoubleClick = () => resetLayout();



  if (!open || typeof document === 'undefined') return null;



  const scopeOptions: { id: SiQuickDashboardScopeMode; label: string }[] = [

    { id: 'viewport', label: t(language, 'Map extent', 'نطاق الخريطة') },

    { id: 'aoi', label: t(language, 'AOI', 'منطقة AOI') },

    { id: 'selection', label: t(language, 'Selection', 'تحديد') },

    { id: 'all', label: t(language, 'All features', 'كل المعالم') },

  ];



  const filterLabel =

    crossFilter && dashboard

      ? describeQuickDashboardCrossFilter(

          crossFilter,

          dashboard.fields.find(f => f.key === crossFilter.field)?.label,

        )

      : '';



  const panelCssVars = theme.cssVars as React.CSSProperties;



  const body = (

    <div className="si-qdash-host" role="presentation">

      <div

        ref={panelRef}

        className={

          'si-qdash-panel si-qdash-panel--pro si-qdash-panel--float-card' +

          (dragging ? ' si-qdash-panel--dragging' : '') +

          (resizing ? ' si-qdash-panel--resizing' : '')

        }

        dir={dir}

        role="dialog"

        aria-labelledby="si-qdash-title"

        style={{ ...panelStyle, ...panelCssVars }}

        data-theme={theme.id}

      >

        <header

          className="si-qdash-head"

          onPointerDown={onDragPointerDown}

          onPointerMove={onDragPointerMove}

          onPointerUp={endDrag}

          onPointerCancel={endDrag}

          onDoubleClick={onHeadDoubleClick}

          title={t(language, 'Drag to move · double-click to reset', 'اسحب للتحريك · نقرتان لإعادة الموضع')}

        >

          <div className="si-qdash-head__grip" aria-hidden>

            <i className="fa-solid fa-grip-vertical" />

          </div>

          <div className="si-qdash-head__titles">

            <SiStatDashboardIcon size={18} />

            <div>

              <h2 id="si-qdash-title">Quick Dashboard Pro</h2>

              <p>{t(language, 'Smart GIS analytics linked to the map', 'تحليلات GIS ذكية مرتبطة بالخريطة')}</p>

            </div>

          </div>

          <div className="si-qdash-head__actions">

            {phase === 'live' ? (

              <button

                type="button"

                className="si-qdash-reset"

                onClick={exportCsv}

                aria-label={t(language, 'Export CSV', 'تصدير CSV')}

                title={t(language, 'Export data', 'تصدير البيانات')}

              >

                <i className="fa-solid fa-file-export" aria-hidden />

              </button>

            ) : null}

            <button

              type="button"

              className="si-qdash-reset"

              onClick={resetLayout}

              aria-label={t(language, 'Reset position', 'إعادة الموضع')}

              title={t(language, 'Reset position & size', 'إعادة الموضع والحجم')}

            >

              <i className="fa-solid fa-arrows-to-dot" aria-hidden />

            </button>

            <button type="button" className="si-qdash-close" onClick={onClose} aria-label={t(language, 'Close', 'إغلاق')}>

              <i className="fa-solid fa-xmark" aria-hidden />

            </button>

          </div>

        </header>



        <div className="si-qdash-body">

          {layers.length === 0 ? (

            <p className="si-qdash-empty">{t(language, 'Add a vector layer to begin.', 'أضف طبقة متجهة للبدء.')}</p>

          ) : (

            <>

              <div className="si-qdash-row">

                <label className="si-qdash-field">

                  <span>{t(language, 'Layer', 'الطبقة')}</span>

                  <select value={layer?.id ?? ''} onChange={e => setLayerId(e.target.value)}>

                    {layers.map(l => (

                      <option key={l.id} value={l.id}>

                        {l.name} ({l.features.length})

                      </option>

                    ))}

                  </select>

                </label>

              </div>



              <div className="si-qdash-scope" role="group" aria-label="Spatial scope">

                {scopeOptions.map(o => (

                  <button

                    key={o.id}

                    type="button"

                    className={'si-qdash-scope-btn' + (scope === o.id ? ' si-qdash-scope-btn--on' : '')}

                    disabled={

                      (o.id === 'aoi' && !aoiFeature) ||

                      (o.id === 'selection' && !selectedFeatureKeys?.size)

                    }

                    onClick={() => setScope(o.id)}

                  >

                    {o.label}

                  </button>

                ))}

              </div>



              {phase === 'setup' ? (

                <>

                  <p className="si-qdash-hint">

                    {t(

                      language,

                      'Fields are auto-detected. Select optional fields or create with smart defaults.',

                      'يُكتشف الحقل تلقائياً. اختر حقولاً اختيارية أو أنشئ بإعدادات ذكية.',

                    )}

                  </p>

                  <SiQuickDashboardFieldPicker
                    fields={fieldMetas}
                    selected={pickedFields}
                    onToggle={toggleField}
                    onSelectMany={selectFields}
                    onClear={clearFields}
                    language={language}
                    dir={dir}
                  />

                  <button

                    type="button"

                    className="si-qdash-primary"

                    onClick={() => setPhase('live')}

                    disabled={!layer?.features.length}

                  >

                    {t(language, 'Create dashboard', 'إنشاء لوحة المعلومات')}

                  </button>

                </>

              ) : (

                <>

                  <div className="si-qdash-live-bar">

                    <span className="si-qdash-live-dot" aria-hidden />

                    {t(language, 'Live', 'مباشر')} · {filteredFeatures.length}/{scopedFeatures.length}{' '}

                    {t(language, 'features', 'معلم')}

                    <button type="button" className="si-qdash-link" onClick={() => setPhase('setup')}>

                      {t(language, 'Edit fields', 'تعديل الحقول')}

                    </button>

                  </div>



                  {crossFilter ? (

                    <div className="si-qdash-filter-chip">

                      <i className="fa-solid fa-filter" aria-hidden />

                      <span>{filterLabel}</span>

                      <button type="button" onClick={() => setCrossFilter(null)} aria-label={t(language, 'Clear filter', 'مسح التصفية')}>

                        <i className="fa-solid fa-xmark" aria-hidden />

                      </button>

                    </div>

                  ) : null}



                  {dashboard?.insights.length ? (

                    <div className="si-qdash-insights" role="status">

                      <div className="si-qdash-insights__head">

                        <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />

                        {t(language, 'Smart insights', 'رؤى ذكية')}

                      </div>

                      <ul>

                        {dashboard.insights.map((line, i) => (

                          <li key={i}>{line}</li>

                        ))}

                      </ul>

                    </div>

                  ) : null}



                  {dashboard ? (

                    <>

                      <div className="si-qdash-kpis si-qdash-kpis--pro">

                        {dashboard.kpis.map(k => (

                          <div

                            key={k.id}

                            className={'si-qdash-kpi si-qdash-kpi--smart' + (k.tone ? ` si-qdash-kpi--${k.tone}` : '')}

                          >

                            {k.icon ? <i className={`fa-solid ${k.icon} si-qdash-kpi-icon`} aria-hidden /> : null}

                            <span className="si-qdash-kpi-k">{k.label}</span>

                            <strong className="si-qdash-kpi-v" dir="ltr">

                              {k.value}

                            </strong>

                            {k.hint ? <span className="si-qdash-kpi-hint">{k.hint}</span> : null}

                          </div>

                        ))}

                      </div>

                      <div className="si-qdash-grid">

                        {orderedWidgets.map(w => (

                          <article

                            key={w.id}

                            className={

                              'si-qdash-widget si-qdash-widget--pro si-qdash-widget--resizable' +

                              (dragWidgetId === w.id ? ' si-qdash-widget--dragging' : '') +

                              (crossFilter?.sourceWidgetId === w.id ? ' si-qdash-widget--filter-source' : '')

                            }

                            draggable

                            onDragStart={() => onWidgetDragStart(w.id)}

                            onDragEnd={() => setDragWidgetId(null)}

                            onDragOver={e => onWidgetDragOver(e, w.id)}

                          >

                            <div className="si-qdash-widget-head">

                              <button type="button" className="si-qdash-widget-drag" aria-label={t(language, 'Reorder', 'إعادة ترتيب')}>

                                <i className="fa-solid fa-grip-lines" aria-hidden />

                              </button>

                              <h3>{w.label}</h3>

                              <span className="si-qdash-widget-kind">{chartKindLabel(w.kind, language)}</span>

                            </div>

                            <div className="si-qdash-widget-body">

                              <WidgetBodyPro widget={w} theme={theme} handlers={chartHandlers} />

                            </div>

                          </article>

                        ))}

                      </div>

                    </>

                  ) : (

                    <p className="si-qdash-empty">{t(language, 'No data in current scope.', 'لا توجد بيانات في النطاق الحالي.')}</p>

                  )}

                </>

              )}

            </>

          )}

        </div>

        {resizeHandles.map(h => (

          <button

            key={h.id}

            type="button"

            className={h.className}

            aria-label={h.label}

            onPointerDown={onResizePointerDown(h.id)}

          />

        ))}

      </div>

    </div>

  );



  return createPortal(body, document.body);

}


