import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useLanguage } from '@/lib/i18n';
import type { LayerLiveIndexSelectGroup } from '../../../lib/siLayerLiveCompositeCatalog';
import { resolveLayerLiveAbbr } from '../../../lib/siLayerLiveCompositeCatalog';
import { SiLayerLiveIndexSelect } from './SiLayerLiveIndexSelect';
import { SiMapSwipeModeSelector } from './SiMapSwipeModeSelector';
import { useSiFloatingResizableCard } from '../hooks/useSiFloatingResizableCard';
import { siMapLeftPopoutFixedPosition } from '../utils/siMapFloatingPanelLayout';
import { SI_MAP_SWIPE_SIDE_A_KEY, SI_MAP_SWIPE_SIDE_B_KEY, useSiMapSwipeStore } from '../stores/siMapSwipeStore';
import type { SiMapSwipeMode } from '../utils/siMapLayerSwipeCatalog';
import './SiMapSwipeComparisonPanel.css';
import './SiMapSwipeModeSelector.css';

const SI_SWIPE_PANEL_LAYOUT_LS = 'si-swipe-comparison-panel-layout-v1';

export type SiMapSwipeComparisonPanelProps = {
  open: boolean;
  mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>;
  layerLiveGroups: LayerLiveIndexSelectGroup[];
  defaultDateIso: string;
  availableDates: string[];
  onClose: () => void;
};

function resolveMapCanvas(mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>): HTMLCanvasElement | null {
  const raw = mapRef.current;
  if (!raw) return null;
  const map =
    typeof (raw as { getMap?: () => MapboxMap }).getMap === 'function'
      ? (raw as { getMap: () => MapboxMap }).getMap()
      : (raw as MapboxMap);
  return map?.getCanvas?.() ?? null;
}

function SideLegend({ label, layerId, dateIso }: { label: string; layerId: string; dateIso: string }) {
  const { abbr } = resolveLayerLiveAbbr(layerId, layerId);
  return (
    <div className="si-swipe-compare-panel__legend-card">
      <span className="si-swipe-compare-panel__legend-tag">{label}</span>
      <strong>{abbr}</strong>
      <span className="si-swipe-compare-panel__legend-date">{dateIso?.slice(0, 10) || '—'}</span>
    </div>
  );
}

export function SiMapSwipeComparisonPanel({
  open,
  mapRef,
  layerLiveGroups,
  defaultDateIso,
  availableDates,
  onClose,
}: SiMapSwipeComparisonPanelProps) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const panelRef = useRef<HTMLDivElement | null>(null);

  const minimized = useSiMapSwipeStore(s => s.minimized);
  const collapsedControls = useSiMapSwipeStore(s => s.collapsedControls);
  const fullscreen = useSiMapSwipeStore(s => s.fullscreen);
  const layerA = useSiMapSwipeStore(s => s.layerA);
  const layerB = useSiMapSwipeStore(s => s.layerB);
  const runtime = useSiMapSwipeStore(s => s.runtime);
  const showAoiBoundary = useSiMapSwipeStore(s => s.showAoiBoundary);
  const syncColorRamps = useSiMapSwipeStore(s => s.syncColorRamps);

  const setMinimized = useSiMapSwipeStore(s => s.setMinimized);
  const patchRuntime = useSiMapSwipeStore(s => s.patchRuntime);
  const patchLayerA = useSiMapSwipeStore(s => s.patchLayerA);
  const patchLayerB = useSiMapSwipeStore(s => s.patchLayerB);
  const patchWidget = useSiMapSwipeStore(s => s.patchWidget);
  const resetSwipePosition = useSiMapSwipeStore(s => s.resetSwipePosition);
  const swapLayers = useSiMapSwipeStore(s => s.swapLayers);
  const persist = useSiMapSwipeStore(s => s.persist);

  const defaultSwipeSize = useCallback(() => ({ w: 360, h: 520 }), []);
  const defaultSwipePosition = useCallback(
    (size: { w: number; h: number }) => siMapLeftPopoutFixedPosition('layer-swipe', size.h),
    [],
  );

  const {
    panelRef: cardRef,
    panelStyle,
    dragging,
    resizing,
    onDragPointerDown,
    onDragPointerMove,
    endDrag,
    onResizePointerDown,
  } = useSiFloatingResizableCard({
      storageKey: SI_SWIPE_PANEL_LAYOUT_LS,
      enabled: open,
      defaultSize: defaultSwipeSize,
      defaultPosition: defaultSwipePosition,
      minSize: { w: 300, h: 360 },
    });

  const minimizedPanelStyle = useMemo(
    () => siMapLeftPopoutFixedPosition('layer-swipe', 52),
    [open, minimized],
  );

  useEffect(() => {
    if (!open) return;
    if (!layerA.dateIso) patchLayerA({ dateIso: defaultDateIso });
    if (!layerB.dateIso) patchLayerB({ dateIso: defaultDateIso });
    patchRuntime({
      active: true,
      leadingKeys: [SI_MAP_SWIPE_SIDE_A_KEY],
      trailingKeys: [SI_MAP_SWIPE_SIDE_B_KEY],
      leadingOpacity: layerA.opacity,
      trailingOpacity: layerB.opacity,
    });
  }, [
    open,
    defaultDateIso,
    layerA.layerId,
    layerB.layerId,
    layerA.dateIso,
    layerB.dateIso,
    layerA.opacity,
    layerB.opacity,
    patchLayerA,
    patchLayerB,
    patchRuntime,
  ]);

  useEffect(() => {
    if (!open) return;
    persist();
  }, [open, layerA, layerB, runtime, showAoiBoundary, syncColorRamps, persist]);

  const onModeChange = useCallback(
    (mode: SiMapSwipeMode) => {
      patchRuntime({
        mode,
        orientation: mode === 'horizontal' ? 'horizontal' : 'vertical',
      });
    },
    [patchRuntime],
  );

  const exportScreenshot = useCallback(() => {
    const canvas = resolveMapCanvas(mapRef);
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `geosyntra-swipe-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [mapRef]);

  const toggleFullSide = () => {
    patchRuntime({ fullSide: runtime.fullSide === 'a' ? 'b' : 'a' });
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={el => {
            panelRef.current = el;
            cardRef.current = el;
          }}
          className={
            'si-swipe-compare-panel si-layer-swipe-panel' +
            (minimized ? ' si-layer-swipe-panel--min' : '') +
            (fullscreen ? ' si-swipe-compare-panel--fullscreen' : '') +
            (dragging ? ' si-swipe-compare-panel--dragging' : '') +
            (resizing ? ' si-swipe-compare-panel--resizing' : '')
          }
          style={minimized ? minimizedPanelStyle : panelStyle}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-label={ar ? 'مقارنة الطبقات' : 'Layer swipe comparison'}
        >
          <div
            className="si-layer-swipe-panel__head si-swipe-compare-panel__head"
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="si-layer-swipe-panel__brand">
              <i className="fa-solid fa-layer-group" aria-hidden />
              <div>
                <h2 className="si-layer-swipe-panel__title">
                  {ar ? 'مقارنة GIS' : 'GIS Swipe Compare'}
                </h2>
                <p className="si-layer-swipe-panel__sub">
                  {ar ? 'خريطة واحدة · WebGL' : 'Single map · GPU clip'}
                </p>
              </div>
            </div>
            <div className="si-layer-swipe-panel__head-actions">
              <label className="si-layer-swipe-panel__master-toggle" title={ar ? 'تفعيل السحب' : 'Enable swipe'}>
                <input
                  type="checkbox"
                  checked={runtime.active}
                  onChange={e => patchRuntime({ active: e.target.checked })}
                />
                <span className="si-layer-swipe-panel__toggle-ui" aria-hidden />
              </label>
              <button
                type="button"
                className="si-layer-swipe-panel__icon-btn"
                aria-label={minimized ? 'Expand' : 'Minimize'}
                onClick={() => setMinimized(!minimized)}
              >
                <i className={`fa-solid ${minimized ? 'fa-chevron-down' : 'fa-minus'}`} />
              </button>
              <button type="button" className="si-layer-swipe-panel__icon-btn" aria-label="Close" onClick={onClose}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>

          {!minimized ? (
            <div className="si-layer-swipe-panel__body si-swipe-compare-panel__body">
              <SiMapSwipeModeSelector value={runtime.mode} onChange={onModeChange} />

              <button
                type="button"
                className="si-swipe-compare-panel__collapse-toggle"
                onClick={() => patchWidget({ collapsedControls: !collapsedControls })}
              >
                {collapsedControls ? 'Show controls' : 'Hide controls'}
              </button>

              {!collapsedControls ? (
                <>
                  <section className="si-swipe-compare-panel__side">
                    <header>
                      <h3>Layer A</h3>
                      <label className="si-swipe-compare-panel__vis">
                        <input
                          type="checkbox"
                          checked={layerA.visible}
                          disabled={layerA.locked}
                          onChange={e => patchLayerA({ visible: e.target.checked })}
                        />
                        Visible
                      </label>
                    </header>
                    <SiLayerLiveIndexSelect
                      label="Index"
                      value={layerA.layerId}
                      groups={layerLiveGroups}
                      disabled={layerA.locked}
                      onChange={id => patchLayerA({ layerId: id })}
                    />
                    <label className="si-layer-swipe-panel__field">
                      <span>Date A</span>
                      <input
                        type="date"
                        value={(layerA.dateIso || defaultDateIso).slice(0, 10)}
                        disabled={layerA.locked}
                        list="si-swipe-dates-a"
                        onChange={e => patchLayerA({ dateIso: e.target.value })}
                      />
                      <datalist id="si-swipe-dates-a">
                        {availableDates.map(d => (
                          <option key={d} value={d.slice(0, 10)} />
                        ))}
                      </datalist>
                    </label>
                    <label className="si-layer-swipe-panel__field">
                      <span>Opacity A</span>
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={layerA.opacity}
                        onChange={e => {
                          const v = Number(e.target.value);
                          patchLayerA({ opacity: v });
                          patchRuntime({ leadingOpacity: v });
                        }}
                      />
                    </label>
                    <label className="si-swipe-compare-panel__lock">
                      <input
                        type="checkbox"
                        checked={layerA.locked}
                        onChange={e => patchLayerA({ locked: e.target.checked })}
                      />
                      Lock Layer A
                    </label>
                  </section>

                  <section className="si-swipe-compare-panel__side">
                    <header>
                      <h3>Layer B</h3>
                      <label className="si-swipe-compare-panel__vis">
                        <input
                          type="checkbox"
                          checked={layerB.visible}
                          disabled={layerB.locked}
                          onChange={e => patchLayerB({ visible: e.target.checked })}
                        />
                        Visible
                      </label>
                    </header>
                    <SiLayerLiveIndexSelect
                      label="Index"
                      value={layerB.layerId}
                      groups={layerLiveGroups}
                      disabled={layerB.locked}
                      onChange={id => patchLayerB({ layerId: id })}
                    />
                    <label className="si-layer-swipe-panel__field">
                      <span>Date B</span>
                      <input
                        type="date"
                        value={(layerB.dateIso || defaultDateIso).slice(0, 10)}
                        disabled={layerB.locked}
                        list="si-swipe-dates-b"
                        onChange={e => patchLayerB({ dateIso: e.target.value })}
                      />
                      <datalist id="si-swipe-dates-b">
                        {availableDates.map(d => (
                          <option key={d} value={d.slice(0, 10)} />
                        ))}
                      </datalist>
                    </label>
                    <label className="si-layer-swipe-panel__field">
                      <span>Opacity B</span>
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={layerB.opacity}
                        onChange={e => {
                          const v = Number(e.target.value);
                          patchLayerB({ opacity: v });
                          patchRuntime({ trailingOpacity: v });
                        }}
                      />
                    </label>
                    <label className="si-swipe-compare-panel__lock">
                      <input
                        type="checkbox"
                        checked={layerB.locked}
                        onChange={e => patchLayerB({ locked: e.target.checked })}
                      />
                      Lock Layer B
                    </label>
                  </section>
                </>
              ) : null}

              <div className="si-swipe-compare-panel__legends">
                <SideLegend label="A" layerId={layerA.layerId} dateIso={layerA.dateIso || defaultDateIso} />
                <SideLegend label="B" layerId={layerB.layerId} dateIso={layerB.dateIso || defaultDateIso} />
              </div>

              <div className="si-layer-swipe-panel__actions si-swipe-compare-panel__toolbar">
                <button type="button" className="si-layer-swipe-panel__reset" onClick={resetSwipePosition}>
                  Reset position
                </button>
                <button type="button" className="si-layer-swipe-panel__reset" onClick={swapLayers}>
                  Swap A ↔ B
                </button>
                {runtime.mode === 'full' ? (
                  <button type="button" className="si-layer-swipe-panel__reset" onClick={toggleFullSide}>
                    Show {runtime.fullSide === 'a' ? 'B' : 'A'}
                  </button>
                ) : null}
                <button type="button" className="si-layer-swipe-panel__reset" onClick={exportScreenshot}>
                  Screenshot
                </button>
              </div>

              <details className="si-layer-swipe-panel__advanced">
                <summary>Advanced</summary>
                <div className="si-layer-swipe-panel__advanced-body">
                  <label className="si-layer-swipe-panel__divider-toggle">
                    <input
                      type="checkbox"
                      checked={showAoiBoundary}
                      onChange={e => patchWidget({ showAoiBoundary: e.target.checked })}
                    />
                    <span>AOI boundary</span>
                  </label>
                  <label className="si-layer-swipe-panel__divider-toggle">
                    <input
                      type="checkbox"
                      checked={syncColorRamps}
                      onChange={e => patchWidget({ syncColorRamps: e.target.checked })}
                    />
                    <span>Synchronize color ramps</span>
                  </label>
                  <label className="si-layer-swipe-panel__divider-toggle">
                    <input
                      type="checkbox"
                      checked={runtime.dividerVisible}
                      onChange={e => patchRuntime({ dividerVisible: e.target.checked })}
                    />
                    <span>Show swipe handle</span>
                  </label>
                  <label className="si-layer-swipe-panel__field">
                    <span>Divider position</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={runtime.position}
                      onChange={e => patchRuntime({ position: Number(e.target.value) })}
                    />
                    <span className="si-layer-swipe-panel__pct">{Math.round(runtime.position)}%</span>
                  </label>
                  {runtime.mode === 'spyglass' ? (
                    <label className="si-layer-swipe-panel__field">
                      <span>Lens size</span>
                      <input
                        type="range"
                        min={8}
                        max={40}
                        value={runtime.spyRadiusPct}
                        onChange={e => patchRuntime({ spyRadiusPct: Number(e.target.value) })}
                      />
                    </label>
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}

          {!minimized ? (
            <>
              <div className="si-swipe-compare-panel__resize si-swipe-compare-panel__resize--e" onPointerDown={onResizePointerDown('e')} />
              <div className="si-swipe-compare-panel__resize si-swipe-compare-panel__resize--s" onPointerDown={onResizePointerDown('s')} />
              <div className="si-swipe-compare-panel__resize si-swipe-compare-panel__resize--se" onPointerDown={onResizePointerDown('se')} />
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
