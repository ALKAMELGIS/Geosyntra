import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n';
import { clampFixedPanelPosition, siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import {
  DEFAULT_SI_MAP_LAYER_SWIPE_STATE,
  type SiMapLayerSwipeState,
} from '../utils/siMapLayerSwipeRuntime';
import {
  buildSiMapSwipeComparableCatalog,
  filterSiMapSwipeComparableKeys,
  SI_MAP_SWIPE_LAYER_LIVE_KEY,
  type SiMapSwipeLayerEntry,
} from '../utils/siMapLayerSwipeCatalog';
import './SiMapLayerSwipeToolPanel.css';

const SI_LAYER_SWIPE_POS_LS = 'si-layer-swipe-panel-pos-v1';
const SI_LAYER_SWIPE_STATE_LS = 'si-layer-swipe-state-v5';

type PanelPos = { left: number; top: number };

export function readStoredSwipeState(): Partial<SiMapLayerSwipeState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SI_LAYER_SWIPE_STATE_LS);
    if (!raw) return {};
    const o = JSON.parse(raw) as Partial<SiMapLayerSwipeState>;
    return {
      position: typeof o.position === 'number' ? o.position : undefined,
      orientation: o.orientation === 'horizontal' || o.orientation === 'vertical' ? o.orientation : undefined,
      leadingKeys: Array.isArray(o.leadingKeys)
        ? filterSiMapSwipeComparableKeys(o.leadingKeys.filter(k => typeof k === 'string'))
        : undefined,
      trailingKeys: Array.isArray(o.trailingKeys)
        ? filterSiMapSwipeComparableKeys(o.trailingKeys.filter(k => typeof k === 'string'))
        : undefined,
      trailingOpacity: typeof o.trailingOpacity === 'number' ? o.trailingOpacity : undefined,
      leadingOpacity: typeof o.leadingOpacity === 'number' ? o.leadingOpacity : undefined,
      active: typeof o.active === 'boolean' ? o.active : undefined,
      dividerVisible: typeof o.dividerVisible === 'boolean' ? o.dividerVisible : undefined,
    };
  } catch {
    return {};
  }
}

function persistSwipeState(state: SiMapLayerSwipeState): void {
  try {
    localStorage.setItem(SI_LAYER_SWIPE_STATE_LS, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export type SiMapLayerSwipeToolPanelProps = {
  open: boolean;
  minimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  onClose: () => void;
  catalog: SiMapSwipeLayerEntry[];
  state: SiMapLayerSwipeState;
  onStateChange: Dispatch<SetStateAction<SiMapLayerSwipeState>>;
  onResetSwipe?: () => void;
};

function defaultPanelPos(): PanelPos {
  return siMapLeftPopoutFixedPosition('layer-swipe', 360);
}

function readStoredPos(): PanelPos {
  if (typeof window === 'undefined') return defaultPanelPos();
  try {
    const raw = localStorage.getItem(SI_LAYER_SWIPE_POS_LS);
    if (!raw) return defaultPanelPos();
    const o = JSON.parse(raw) as { left?: unknown; top?: unknown };
    const left = Number(o.left);
    const top = Number(o.top);
    if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
  } catch {
    /* ignore */
  }
  return defaultPanelPos();
}

function pickDefaultLeading(catalog: SiMapSwipeLayerEntry[]): string[] {
  const comparable = buildSiMapSwipeComparableCatalog(catalog);
  const custom = comparable.find(c => c.kind === 'custom');
  if (custom) return [custom.key];
  return comparable[0] ? [comparable[0].key] : [];
}

function pickDefaultTrailing(catalog: SiMapSwipeLayerEntry[], leading: string[]): string[] {
  const leadSet = new Set(leading);
  const comparable = buildSiMapSwipeComparableCatalog(catalog);
  const live = comparable.find(c => c.key === SI_MAP_SWIPE_LAYER_LIVE_KEY && !leadSet.has(c.key));
  if (live) return [live.key];
  const custom = comparable.find(c => c.kind === 'custom' && !leadSet.has(c.key));
  if (custom) return [custom.key];
  const next = comparable.find(c => !leadSet.has(c.key));
  return next ? [next.key] : [];
}

function layerKindIcon(kind: SiMapSwipeLayerEntry['kind']): string {
  if (kind === 'wms') return 'fa-layer-group';
  if (kind === 'basemap') return 'fa-map';
  return 'fa-draw-polygon';
}

type LayerPickListProps = {
  id: string;
  title: string;
  hint: string;
  catalog: SiMapSwipeLayerEntry[];
  selectedKeys: string[];
  oppositeKeys: string[];
  onChange: (keys: string[]) => void;
  onClear: () => void;
  ar: boolean;
};

function LayerPickList({
  id,
  title,
  hint,
  catalog,
  selectedKeys,
  oppositeKeys,
  onChange,
  onClear,
  ar,
}: LayerPickListProps) {
  const selected = new Set(selectedKeys);
  const opposite = new Set(oppositeKeys);

  return (
    <section className="si-layer-swipe-panel__section">
      <div className="si-layer-swipe-panel__section-head">
        <div>
          <h3 className="si-layer-swipe-panel__section-title">{title}</h3>
          <p className="si-layer-swipe-panel__section-hint">{hint}</p>
        </div>
        <button
          type="button"
          className="si-layer-swipe-panel__clear-btn"
          onClick={onClear}
          disabled={!selectedKeys.length}
          aria-label={ar ? 'مسح التحديد' : 'Clear selection'}
          title={ar ? 'مسح' : 'Clear'}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      <ul id={id} className="si-layer-swipe-panel__pick-list" role="listbox" aria-multiselectable="true">
        {catalog.map(entry => {
          const checked = selected.has(entry.key);
          const disabled = !checked && opposite.has(entry.key);
          return (
            <li key={entry.key}>
              <label
                className={
                  'si-layer-swipe-panel__pick-row' +
                  (checked ? ' si-layer-swipe-panel__pick-row--checked' : '') +
                  (disabled ? ' si-layer-swipe-panel__pick-row--disabled' : '')
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    if (checked) onChange(selectedKeys.filter(k => k !== entry.key));
                    else onChange([...selectedKeys, entry.key]);
                  }}
                  aria-label={entry.label}
                />
                <i className={`fa-solid ${layerKindIcon(entry.kind)}`} aria-hidden />
                <span title={entry.label}>{entry.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SiMapLayerSwipeToolPanel({
  open,
  minimized = false,
  onMinimizedChange,
  onClose,
  catalog,
  state,
  onStateChange,
  onResetSwipe,
}: SiMapLayerSwipeToolPanelProps) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [pos, setPos] = useState<PanelPos>(() => readStoredPos());
  const [dragging, setDragging] = useState(false);

  const comparableCatalog = buildSiMapSwipeComparableCatalog(catalog);
  const basemapEntry = catalog.find(c => c.kind === 'basemap');
  const canSwipe = comparableCatalog.length >= 2;
  const hasPair =
    filterSiMapSwipeComparableKeys(state.leadingKeys).length > 0 &&
    filterSiMapSwipeComparableKeys(state.trailingKeys).length > 0;

  useLayoutEffect(() => {
    if (!open) return;
    setPos(prev => clampFixedPanelPosition(prev.left, prev.top, 320, minimized ? 52 : 420));
  }, [open, minimized]);

  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(SI_LAYER_SWIPE_POS_LS, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [open, pos]);

  const patchState = useCallback(
    (partial: Partial<SiMapLayerSwipeState>) => {
      onStateChange(prev => ({ ...prev, ...partial }));
    },
    [onStateChange],
  );

  useEffect(() => {
    if (!open) return;
    persistSwipeState(state);
  }, [open, state]);

  useEffect(() => {
    if (!open || !canSwipe) return;
    onStateChange(prev => {
      const keys = new Set(comparableCatalog.map(c => c.key));
      let leadingKeys = filterSiMapSwipeComparableKeys(prev.leadingKeys).filter(k => keys.has(k));
      let trailingKeys = filterSiMapSwipeComparableKeys(prev.trailingKeys).filter(k => keys.has(k));
      let changed = false;

      if (!leadingKeys.length) {
        leadingKeys = pickDefaultLeading(catalog);
        changed = true;
      }
      if (!trailingKeys.length) {
        trailingKeys = pickDefaultTrailing(catalog, leadingKeys);
        changed = true;
      }

      const overlap = trailingKeys.filter(k => leadingKeys.includes(k));
      if (overlap.length) {
        trailingKeys = trailingKeys.filter(k => !leadingKeys.includes(k));
        if (!trailingKeys.length) trailingKeys = pickDefaultTrailing(catalog, leadingKeys);
        changed = true;
      }

      if (!changed) return prev;
      return {
        ...prev,
        leadingKeys,
        trailingKeys,
        active:
          prev.active &&
          leadingKeys.length > 0 &&
          trailingKeys.length > 0 &&
          !leadingKeys.some(k => trailingKeys.includes(k)),
      };
    });
  }, [open, canSwipe, catalog, comparableCatalog, onStateChange]);

  const onLeadingChange = (keys: string[]) => {
    const comparableKeys = filterSiMapSwipeComparableKeys(keys);
    onStateChange(prev => ({
      ...prev,
      leadingKeys: comparableKeys,
      trailingKeys: filterSiMapSwipeComparableKeys(prev.trailingKeys).filter(k => !comparableKeys.includes(k)),
    }));
  };

  const onTrailingChange = (keys: string[]) => {
    const comparableKeys = filterSiMapSwipeComparableKeys(keys);
    onStateChange(prev => ({
      ...prev,
      trailingKeys: comparableKeys,
      leadingKeys: filterSiMapSwipeComparableKeys(prev.leadingKeys).filter(k => !comparableKeys.includes(k)),
    }));
  };

  const handleReset = () => {
    const leadingKeys = pickDefaultLeading(catalog);
    const trailingKeys = pickDefaultTrailing(catalog, leadingKeys);
    onStateChange(prev => ({
      ...prev,
      ...DEFAULT_SI_MAP_LAYER_SWIPE_STATE,
      leadingKeys,
      trailingKeys,
      active: hasPair || (leadingKeys.length > 0 && trailingKeys.length > 0),
      dividerVisible: prev.dividerVisible,
    }));
    onResetSwipe?.();
  };

  const onHeadPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, label')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top };
    setDragging(true);
  };

  const onHeadPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampFixedPanelPosition(
      drag.left + (e.clientX - drag.x),
      drag.top + (e.clientY - drag.y),
      panelRef.current?.offsetWidth ?? 320,
      panelRef.current?.offsetHeight ?? 420,
    );
    setPos(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={panelRef}
          className={`si-layer-swipe-panel${dragging ? ' si-layer-swipe-panel--dragging' : ''}${minimized ? ' si-layer-swipe-panel--min' : ''}`}
          style={{ left: pos.left, top: pos.top }}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-label={ar ? 'أداة السحب' : 'Swipe tool'}
        >
          <div
            className="si-layer-swipe-panel__head"
            onPointerDown={onHeadPointerDown}
            onPointerMove={onHeadPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="si-layer-swipe-panel__brand">
              <i className="fa-solid fa-arrows-left-right" aria-hidden />
              <div>
                <h2 className="si-layer-swipe-panel__title">{ar ? 'أداة السحب' : 'Swipe tool'}</h2>
                <p className="si-layer-swipe-panel__sub">
                  {ar ? 'مقارنة طبقات على خريطة واحدة' : 'Compare layers on one map'}
                </p>
              </div>
            </div>
            <div className="si-layer-swipe-panel__head-actions">
              <label className="si-layer-swipe-panel__master-toggle" title={ar ? 'تفعيل السحب' : 'Enable swipe'}>
                <input
                  type="checkbox"
                  checked={state.active && hasPair}
                  disabled={!canSwipe || !hasPair}
                  onChange={e =>
                    patchState({
                      active: e.target.checked && canSwipe && hasPair,
                    })
                  }
                  aria-label={ar ? 'تفعيل السحب' : 'Enable swipe'}
                />
                <span className="si-layer-swipe-panel__toggle-ui" aria-hidden />
              </label>
              <button
                type="button"
                className="si-layer-swipe-panel__icon-btn"
                aria-label={minimized ? (ar ? 'توسيع' : 'Expand') : ar ? 'تصغير' : 'Minimize'}
                onClick={() => onMinimizedChange?.(!minimized)}
              >
                <i className={`fa-solid ${minimized ? 'fa-chevron-down' : 'fa-minus'}`} />
              </button>
              <button
                type="button"
                className="si-layer-swipe-panel__icon-btn"
                aria-label={ar ? 'إغلاق' : 'Close'}
                onClick={onClose}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>

          {!minimized ? (
            <div className="si-layer-swipe-panel__body">
              {!canSwipe ? (
                <div className="si-layer-swipe-panel__empty">
                  {ar
                    ? 'أضف طبقتين تشغيليتين أو أكثر (Layer Live أو Added Layers) للمقارنة.'
                    : 'Add at least two operational layers (Layer Live or Added Layers) to compare.'}
                </div>
              ) : (
                <>
                  {basemapEntry ? (
                    <p className="si-layer-swipe-panel__basemap-note">
                      <i className="fa-solid fa-map" aria-hidden />
                      {ar
                        ? `${basemapEntry.label} ثابتة على كلا الجانبين — المقارنة للطبقات فقط.`
                        : `${basemapEntry.label} stays on both sides — swipe compares operational layers only.`}
                    </p>
                  ) : null}

                  <div className="si-layer-swipe-panel__field">
                    <label htmlFor="si-swipe-direction">
                      <span>{ar ? 'اتجاه السحب' : 'Swipe direction'}</span>
                      <i
                        className="fa-solid fa-circle-info si-layer-swipe-panel__info"
                        title={
                          ar
                            ? 'عمودي: فاصل يمين/يسار. أفقي: فاصل أعلى/أسفل.'
                            : 'Vertical: left/right divider. Horizontal: top/bottom divider.'
                        }
                        aria-hidden
                      />
                    </label>
                    <select
                      id="si-swipe-direction"
                      value={state.orientation}
                      onChange={e =>
                        patchState({
                          orientation: e.target.value === 'horizontal' ? 'horizontal' : 'vertical',
                        })
                      }
                    >
                      <option value="vertical">{ar ? 'عمودي (يمين / يسار)' : 'Vertical (left / right)'}</option>
                      <option value="horizontal">{ar ? 'أفقي (أعلى / أسفل)' : 'Horizontal (top / bottom)'}</option>
                    </select>
                  </div>

                  <LayerPickList
                    id="si-swipe-leading"
                    title={ar ? 'Select leading layers' : 'Select leading layers'}
                    hint={
                      ar
                        ? 'طبقات قبل الفاصل (يسار أو أعلى).'
                        : 'Layers before the divider (left or top).'
                    }
                    catalog={comparableCatalog}
                    selectedKeys={state.leadingKeys}
                    oppositeKeys={state.trailingKeys}
                    onChange={onLeadingChange}
                    onClear={() => onLeadingChange([])}
                    ar={ar}
                  />

                  <LayerPickList
                    id="si-swipe-trailing"
                    title={ar ? 'Select trailing layers' : 'Select trailing layers'}
                    hint={
                      ar
                        ? 'طبقات بعد الفاصل (يمين أو أسفل).'
                        : 'Layers after the divider (right or bottom).'
                    }
                    catalog={comparableCatalog}
                    selectedKeys={state.trailingKeys}
                    oppositeKeys={state.leadingKeys}
                    onChange={onTrailingChange}
                    onClear={() => onTrailingChange([])}
                    ar={ar}
                  />

                  <div className="si-layer-swipe-panel__actions">
                    <button type="button" className="si-layer-swipe-panel__reset" onClick={handleReset}>
                      {ar ? 'إعادة ضبط السحب' : 'Reset swipe'}
                    </button>
                    <label className="si-layer-swipe-panel__divider-toggle">
                      <input
                        type="checkbox"
                        checked={state.dividerVisible}
                        onChange={e => patchState({ dividerVisible: e.target.checked })}
                      />
                      <span>{ar ? 'إظهار الفاصل' : 'Show swipe divider'}</span>
                    </label>
                  </div>

                  <details className="si-layer-swipe-panel__advanced">
                    <summary>{ar ? 'خيارات متقدمة' : 'Advanced'}</summary>
                    <div className="si-layer-swipe-panel__advanced-body">
                      <div className="si-layer-swipe-panel__field">
                        <label htmlFor="si-swipe-leading-opacity">
                          {ar ? 'شفافية Leading' : 'Leading opacity'}
                        </label>
                        <input
                          id="si-swipe-leading-opacity"
                          type="range"
                          className="slider__track"
                          min={0.2}
                          max={1}
                          step={0.05}
                          value={state.leadingOpacity}
                          onChange={e => patchState({ leadingOpacity: Number(e.target.value) })}
                        />
                      </div>
                      <div className="si-layer-swipe-panel__field">
                        <label htmlFor="si-swipe-trailing-opacity">
                          {ar ? 'شفافية Trailing' : 'Trailing opacity'}
                        </label>
                        <input
                          id="si-swipe-trailing-opacity"
                          type="range"
                          className="slider__track"
                          min={0.2}
                          max={1}
                          step={0.05}
                          value={state.trailingOpacity}
                          onChange={e => patchState({ trailingOpacity: Number(e.target.value) })}
                        />
                      </div>
                      <div className="si-layer-swipe-panel__field">
                        <label htmlFor="si-swipe-position">{ar ? 'موضع الفاصل' : 'Divider position'}</label>
                        <input
                          id="si-swipe-position"
                          type="range"
                          className="slider__track"
                          min={0}
                          max={100}
                          value={state.position}
                          onChange={e => patchState({ position: Number(e.target.value) })}
                        />
                        <span className="si-layer-swipe-panel__pct">{Math.round(state.position)}%</span>
                      </div>
                    </div>
                  </details>
                </>
              )}
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
