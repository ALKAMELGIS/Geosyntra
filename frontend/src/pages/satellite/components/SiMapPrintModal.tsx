import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { appAlert } from '../../../lib/appDialog';
import type { SiPdfLngLatBounds } from '../utils/siAoiReportCartography';
import { captureSiMapPrintSnapshot } from '../utils/siMapPrintCapture';
import { composeSiMapPrintPage } from '../utils/siMapPrintComposer';
import { computeSiMapPrintLayout } from '../utils/siMapPrintLayout';
import type { SiMapPrintLayerIndexRow } from '../utils/siMapPrintLayerIndex';
import { exportSiMapPrintPdf, triggerSiMapBrowserPrint } from '../utils/siMapPrintExport';
import type { SiMapPrintBasemapMode } from '../utils/siMapPrintBasemap';
import {
  pickSiMapPrintCaptureSlice,
  pickSiMapPrintComposeSlice,
  SI_MAP_PRINT_PREVIEW_CAPTURE_SCALE,
  siMapPrintCaptureSliceKey,
  siMapPrintComposeSliceKey,
} from '../utils/siMapPrintPreview';
import {
  DEFAULT_SI_MAP_PRINT_SETTINGS,
  siMapPrintAspectRatio,
  siMapPrintPageLabel,
  type SiMapPrintLayoutOffsets,
  type SiMapPrintSettings,
} from '../utils/siMapPrintTypes';
import type { SiAoiLegendStripItem } from '../utils/siAoiReportSlotMapRender';
import { SiMapPrintCustomLayout } from './SiMapPrintCustomLayout';
import './SiMapPrintModal.css';

export type SiMapPrintModalProps = {
  open: boolean;
  onClose: () => void;
  mapRef: React.RefObject<MapRef | null>;
  mapLoaded: boolean;
  aoiFitBounds: [[number, number], [number, number]] | null;
  mapLngLatBounds: SiPdfLngLatBounds | null;
  legendItems: SiAoiLegendStripItem[];
  layerIndexRows: SiMapPrintLayerIndexRow[];
  metaLine?: string;
  defaultTitle?: string;
  preparePrintBasemap?: (mode: SiMapPrintBasemapMode) => Promise<void>;
  restorePrintBasemap?: () => Promise<void>;
};

export function SiMapPrintModal({
  open,
  onClose,
  mapRef,
  mapLoaded,
  aoiFitBounds,
  mapLngLatBounds,
  legendItems,
  layerIndexRows,
  metaLine,
  defaultTitle,
  preparePrintBasemap,
  restorePrintBasemap,
}: SiMapPrintModalProps) {
  const [settings, setSettings] = useState<SiMapPrintSettings>(() => ({
    ...DEFAULT_SI_MAP_PRINT_SETTINGS,
    title: defaultTitle?.trim() || DEFAULT_SI_MAP_PRINT_SETTINGS.title,
  }));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawCaptureUrl, setRawCaptureUrl] = useState<string | null>(null);
  const [exportRawUrl, setExportRawUrl] = useState<string | null>(null);
  const [exportCaptureScale, setExportCaptureScale] = useState<1 | 2 | 3 | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const composeGenRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!open) return;
    setSettings(s => ({
      ...s,
      title: defaultTitle?.trim() || s.title || DEFAULT_SI_MAP_PRINT_SETTINGS.title,
    }));
    setPreviewUrl(null);
    setRawCaptureUrl(null);
    setExportRawUrl(null);
    setExportCaptureScale(null);
    setErr(null);
  }, [open, defaultTitle]);

  const captureSlice = useMemo(() => pickSiMapPrintCaptureSlice(settings), [settings]);
  const captureKey = siMapPrintCaptureSliceKey(captureSlice);

  const composeSlice = useMemo(() => pickSiMapPrintComposeSlice(settings), [settings]);
  const composeKey = useMemo(
    () =>
      siMapPrintComposeSliceKey(
        composeSlice,
        settings.includeLegend ? legendItems.length : 0,
        settings.includeLayerList ? layerIndexRows.length : 0,
      ),
    [composeSlice, settings.includeLegend, settings.includeLayerList, legendItems.length, layerIndexRows.length],
  );

  const patch = useCallback((partial: Partial<SiMapPrintSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const recomposeFromRaw = useCallback(
    async (raw: string, s: SiMapPrintSettings, gen: number) => {
      const composed = await composeSiMapPrintPage({
        mapPng: raw,
        settings: s,
        legendItems: s.includeLegend ? legendItems : [],
        layerIndexRows: s.includeLayerList ? layerIndexRows : [],
        mapLngLatBounds,
        metaLine,
      });
      if (gen === composeGenRef.current) setPreviewUrl(composed);
      return composed;
    },
    [legendItems, layerIndexRows, mapLngLatBounds, metaLine],
  );

  const runCapture = useCallback(
    async (scale: 1 | 2 | 3, opts?: { storeExport?: boolean }) => {
      if (!open) return null;
      setCapturing(true);
      setErr(null);
      try {
        const raw = await captureSiMapPrintSnapshot({
          mapRef: mapRef.current,
          mapLoaded,
          extent: settingsRef.current.extent,
          aoiFitBounds,
          basemapMode: settingsRef.current.basemapMode,
          scale,
          fastCapture: scale <= SI_MAP_PRINT_PREVIEW_CAPTURE_SCALE,
          prepareBasemap: preparePrintBasemap,
          restoreBasemap: restorePrintBasemap,
        });
        if (!raw) {
          setErr('Could not capture the map. Wait for tiles to finish loading, then try again.');
          setPreviewUrl(null);
          setRawCaptureUrl(null);
          return null;
        }
        setRawCaptureUrl(raw);
        if (opts?.storeExport || scale === settingsRef.current.resolutionScale) {
          setExportRawUrl(raw);
          setExportCaptureScale(scale);
        }
        const gen = ++composeGenRef.current;
        await recomposeFromRaw(raw, settingsRef.current, gen);
        return raw;
      } catch (e) {
        setErr((e as Error)?.message ?? 'Preview failed.');
        return null;
      } finally {
        setCapturing(false);
      }
    },
    [open, mapRef, mapLoaded, aoiFitBounds, preparePrintBasemap, restorePrintBasemap, recomposeFromRaw],
  );

  useEffect(() => {
    setExportRawUrl(null);
    setExportCaptureScale(null);
  }, [captureKey]);

  useEffect(() => {
    if (!open || !mapLoaded) return;
    const t = window.setTimeout(() => {
      void runCapture(SI_MAP_PRINT_PREVIEW_CAPTURE_SCALE);
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, mapLoaded, captureKey, runCapture]);

  useEffect(() => {
    if (!open || !mapLoaded || !rawCaptureUrl || capturing) return;
    const gen = ++composeGenRef.current;
    setComposing(true);
    let cancelled = false;
    void recomposeFromRaw(rawCaptureUrl, settingsRef.current, gen)
      .catch(e => {
        if (!cancelled) setErr((e as Error)?.message ?? 'Layout update failed.');
      })
      .finally(() => {
        if (!cancelled) setComposing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [composeKey, open, mapLoaded, rawCaptureUrl, capturing, recomposeFromRaw]);

  useEffect(() => {
    if (!open || !mapLoaded || !settings.customLayout) return;
    const t = window.setTimeout(() => {
      if (!rawCaptureUrl || capturing) return;
      const gen = ++composeGenRef.current;
      setComposing(true);
      void recomposeFromRaw(rawCaptureUrl, settingsRef.current, gen).finally(() => setComposing(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [settings.layoutOffsets, settings.customLayout, open, mapLoaded, rawCaptureUrl, capturing, recomposeFromRaw]);

  const refreshPreview = useCallback(() => {
    void runCapture(SI_MAP_PRINT_PREVIEW_CAPTURE_SCALE);
  }, [runCapture]);

  const ensureExportCapture = useCallback(async (): Promise<string | null> => {
    const targetScale = settingsRef.current.resolutionScale;
    if (exportRawUrl && exportCaptureScale === targetScale) {
      return exportRawUrl;
    }
    return runCapture(targetScale, { storeExport: true });
  }, [exportRawUrl, exportCaptureScale, runCapture]);

  const aspectStyle = useMemo(
    () => ({ aspectRatio: String(siMapPrintAspectRatio(settings)) }),
    [settings.paper, settings.orientation],
  );

  const layoutPlan = useMemo(
    () =>
      computeSiMapPrintLayout({
        settings,
        legendItems: settings.includeLegend ? legendItems : [],
        layerIndexRows: settings.includeLayerList ? layerIndexRows : [],
        metaLine,
      }),
    [settings, legendItems, layerIndexRows, metaLine],
  );

  const onExportPdf = useCallback(() => {
    if (!previewUrl) return;
    setExporting(true);
    void (async () => {
      try {
        const hiRes = await ensureExportCapture();
        if (!hiRes) {
          const message = 'Could not capture the map for export. Wait for tiles to load, then try again.';
          setErr(message);
          void appAlert(message, { title: 'PDF export' });
          return;
        }
        const stamp = new Date().toISOString().slice(0, 10);
        let composed = previewUrl;
        if (hiRes !== rawCaptureUrl) {
          composed = await composeSiMapPrintPage({
            mapPng: hiRes,
            settings: settingsRef.current,
            legendItems: settingsRef.current.includeLegend ? legendItems : [],
            layerIndexRows: settingsRef.current.includeLayerList ? layerIndexRows : [],
            mapLngLatBounds,
            metaLine,
          });
        }
        await exportSiMapPrintPdf(composed, settingsRef.current, `geosyntra-map-${stamp}.pdf`, {
          rawMapPng: hiRes,
          legendItems: settingsRef.current.includeLegend ? legendItems : [],
          layerIndexRows: settingsRef.current.includeLayerList ? layerIndexRows : [],
          mapLngLatBounds,
          metaLine,
        });
      } catch (e) {
        const message = (e as Error)?.message ?? 'PDF export failed.';
        setErr(message);
        void appAlert(message, { title: 'PDF export' });
      } finally {
        setExporting(false);
      }
    })();
  }, [
    previewUrl,
    ensureExportCapture,
    rawCaptureUrl,
    legendItems,
    layerIndexRows,
    mapLngLatBounds,
    metaLine,
  ]);

  const resetLayoutOffsets = useCallback(() => {
    patch({ layoutOffsets: {} });
  }, [patch]);

  const onBrowserPrint = useCallback(() => {
    if (!previewUrl) return;
    setExporting(true);
    void (async () => {
      try {
        const hiRes = await ensureExportCapture();
        let composed = previewUrl;
        if (hiRes && hiRes !== rawCaptureUrl) {
          composed = await composeSiMapPrintPage({
            mapPng: hiRes,
            settings: settingsRef.current,
            legendItems: settingsRef.current.includeLegend ? legendItems : [],
            layerIndexRows: settingsRef.current.includeLayerList ? layerIndexRows : [],
            mapLngLatBounds,
            metaLine,
          });
        }
        triggerSiMapBrowserPrint(composed, settingsRef.current.title);
      } finally {
        setExporting(false);
      }
    })();
  }, [previewUrl, ensureExportCapture, rawCaptureUrl, legendItems, layerIndexRows, mapLngLatBounds, metaLine]);

  const busy = capturing || exporting;
  const previewBusy = capturing && !previewUrl;
  const layoutBusy = composing && !capturing;

  if (!open) return null;

  const aoiExtentDisabled = !aoiFitBounds;

  return (
    <div
      className="si-map-print-backdrop"
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="si-map-print-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="si-map-print-title"
        onClick={e => e.stopPropagation()}
      >
        <aside className="si-map-print-modal__side">
          <header className="si-map-print-modal__head">
            <h2 id="si-map-print-title" className="si-map-print-modal__title">
              Map print preview
            </h2>
            <button type="button" className="si-map-print-modal__close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </header>

          <div className="si-map-print-modal__scroll">
            <section className="si-map-print-section" aria-labelledby="si-map-print-paper">
              <h3 id="si-map-print-paper" className="si-map-print-section__kicker">
                Paper &amp; extent
              </h3>
              <div className="si-map-print-grid">
                <label className="si-map-print-field">
                  Paper
                  <select
                    value={settings.paper}
                    onChange={e => patch({ paper: e.target.value as SiMapPrintSettings['paper'] })}
                  >
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                  </select>
                </label>
                <label className="si-map-print-field">
                  Orientation
                  <select
                    value={settings.orientation}
                    onChange={e => patch({ orientation: e.target.value as SiMapPrintSettings['orientation'] })}
                  >
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </label>
                <label className="si-map-print-field si-map-print-field--full">
                  Map extent
                  <select
                    value={settings.extent}
                    onChange={e => patch({ extent: e.target.value as SiMapPrintSettings['extent'] })}
                  >
                    <option value="viewport">Current screen view</option>
                    <option value="aoi" disabled={aoiExtentDisabled}>
                      Fit to AOI / field boundary{aoiExtentDisabled ? ' (none drawn)' : ''}
                    </option>
                  </select>
                </label>
                <label className="si-map-print-field">
                  Resolution
                  <select
                    value={String(settings.resolutionScale)}
                    onChange={e => patch({ resolutionScale: Number(e.target.value) === 3 ? 3 : 2 })}
                  >
                    <option value="2">High (2×)</option>
                    <option value="3">Ultra (3×)</option>
                  </select>
                </label>
                <label className="si-map-print-field si-map-print-field--full">
                  Basemap background
                  <select
                    value={settings.basemapMode}
                    onChange={e => patch({ basemapMode: e.target.value as SiMapPrintSettings['basemapMode'] })}
                  >
                    <option value="current">Current map basemap</option>
                    <option value="cartographic">Light gray basemap (print)</option>
                    <option value="none">No basemap (white)</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="si-map-print-section" aria-labelledby="si-map-print-map-el">
              <h3 id="si-map-print-map-el" className="si-map-print-section__kicker">
                Layout elements
              </h3>
              <div className="si-map-print-toggles">
                <label className="si-map-print-toggle">
                  <input
                    type="checkbox"
                    checked={settings.fitMapOnPaper}
                    onChange={e => patch({ fitMapOnPaper: e.target.checked })}
                  />
                  <span>Fit map on paper</span>
                </label>
                {(
                  [
                    ['includeLegend', 'Key (below map)'],
                    ['includeLocator', 'Locator inset (on map)'],
                    ['includeScale', 'Scale bar (footer)'],
                    ['includeNorthArrow', 'North arrow (footer)'],
                    ['includeLayerList', 'Index / live layers'],
                    ['includeWatermark', 'Draft watermark'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="si-map-print-toggle">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={e => patch({ [key]: e.target.checked } as Partial<SiMapPrintSettings>)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="si-map-print-section" aria-labelledby="si-map-print-layout">
              <h3 id="si-map-print-layout" className="si-map-print-section__kicker">
                Layout &amp; export
              </h3>
              <div className="si-map-print-toggles">
                <label className="si-map-print-toggle">
                  <input
                    type="checkbox"
                    checked={settings.customLayout}
                    onChange={e => patch({ customLayout: e.target.checked })}
                  />
                  <span>Custom layout (drag on preview)</span>
                </label>
                <label className="si-map-print-toggle">
                  <input
                    type="checkbox"
                    checked={settings.vectorPdf}
                    onChange={e => patch({ vectorPdf: e.target.checked })}
                  />
                  <span>Vector PDF (sharp legend &amp; scale)</span>
                </label>
              </div>
              {settings.customLayout ? (
                <button type="button" className="si-map-print-btn si-map-print-btn--ghost si-map-print-btn--block" onClick={resetLayoutOffsets}>
                  Reset layout positions
                </button>
              ) : null}
              <p className="si-map-print-hint">
                Preview updates instantly when you change orientation or layout. Full resolution is captured on PDF /
                Print export. Use the PDF icon below to save — Vector PDF keeps legend and scale as sharp vectors.
              </p>
            </section>

            <section className="si-map-print-section" aria-labelledby="si-map-print-text">
              <h3 id="si-map-print-text" className="si-map-print-section__kicker">
                Title &amp; description
              </h3>
              <div className="si-map-print-toggles" style={{ marginBottom: 8 }}>
                <label className="si-map-print-toggle">
                  <input
                    type="checkbox"
                    checked={settings.includeTitle}
                    onChange={e => patch({ includeTitle: e.target.checked })}
                  />
                  <span>Show title</span>
                </label>
                <label className="si-map-print-toggle">
                  <input
                    type="checkbox"
                    checked={settings.includeDescription}
                    onChange={e => patch({ includeDescription: e.target.checked })}
                  />
                  <span>Show description</span>
                </label>
              </div>
              <label className="si-map-print-field si-map-print-field--full">
                Title
                <input
                  type="text"
                  value={settings.title}
                  onChange={e => patch({ title: e.target.value })}
                  disabled={!settings.includeTitle}
                />
              </label>
              <label className="si-map-print-field si-map-print-field--full">
                Description
                <textarea
                  value={settings.description}
                  onChange={e => patch({ description: e.target.value })}
                  disabled={!settings.includeDescription}
                  placeholder="Optional notes for the print footer…"
                />
              </label>
            </section>
          </div>

          <footer className="si-map-print-actions si-map-print-actions--icon-row" aria-label="Print actions">
            <button
              type="button"
              className="si-map-print-btn si-map-print-btn--icon si-map-print-btn--ghost"
              onClick={refreshPreview}
              disabled={busy || !mapLoaded}
              aria-label={capturing ? 'Capturing map preview' : 'Refresh print preview'}
              title={capturing ? 'Capturing…' : 'Refresh preview'}
            >
              <i
                className={`fa-solid fa-arrows-rotate${capturing ? ' fa-spin' : ''}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              className="si-map-print-btn si-map-print-btn--icon"
              onClick={onBrowserPrint}
              disabled={!previewUrl || busy}
              aria-label="Print map"
              title="Print — opens the browser print dialog"
            >
              <i className="fa-solid fa-print" aria-hidden />
            </button>
            <button
              type="button"
              className="si-map-print-btn si-map-print-btn--icon si-map-print-btn--accent"
              onClick={onExportPdf}
              disabled={!previewUrl || busy}
              aria-label={settings.vectorPdf ? 'Export vector PDF' : 'Export PDF'}
              title={settings.vectorPdf ? 'Export vector PDF' : 'Export PDF'}
            >
              <i className="fa-solid fa-file-pdf" aria-hidden />
            </button>
          </footer>
        </aside>

        <div className="si-map-print-preview">
          <div className="si-map-print-preview__head">
            <span className="si-map-print-preview__label">Live preview</span>
            <span className="si-map-print-preview__badge">{siMapPrintPageLabel(settings)}</span>
          </div>
          <div className="si-map-print-preview__frame">
            {previewUrl ? (
              <div
                className={
                  'si-map-print-preview__sheet' +
                  (layoutBusy ? ' si-map-print-preview__sheet--composing' : '')
                }
                style={aspectStyle}
              >
                <img src={previewUrl} alt="Map print preview" />
                <SiMapPrintCustomLayout
                  plan={layoutPlan}
                  enabled={settings.customLayout}
                  offsets={settings.layoutOffsets}
                  onOffsetsChange={(next: SiMapPrintLayoutOffsets) => patch({ layoutOffsets: next })}
                />
              </div>
            ) : (
              <p className="si-map-print-preview__empty">
                {previewBusy ? 'Capturing map…' : 'Use the refresh icon below to capture the map.'}
              </p>
            )}
          </div>
          {previewBusy ? (
            <p className="si-map-print-preview__status">Capturing map…</p>
          ) : layoutBusy ? (
            <p className="si-map-print-preview__status">Updating layout…</p>
          ) : exporting ? (
            <p className="si-map-print-preview__status">Preparing high-resolution export…</p>
          ) : null}
          {err ? <p className="si-map-print-preview__err">{err}</p> : null}
        </div>
      </div>
    </div>
  );
}
