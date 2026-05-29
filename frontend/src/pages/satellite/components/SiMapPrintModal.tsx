import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { SiPdfLngLatBounds } from '../utils/siAoiReportCartography';
import { captureSiMapPrintSnapshot } from '../utils/siMapPrintCapture';
import { composeSiMapPrintPage } from '../utils/siMapPrintComposer';
import { computeSiMapPrintLayout } from '../utils/siMapPrintLayout';
import { exportSiMapPrintPdf, triggerSiMapBrowserPrint } from '../utils/siMapPrintExport';
import type { SiMapPrintBasemapMode } from '../utils/siMapPrintBasemap';
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
  layerLines: string[];
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
  layerLines,
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSettings(s => ({
      ...s,
      title: defaultTitle?.trim() || s.title || DEFAULT_SI_MAP_PRINT_SETTINGS.title,
    }));
    setPreviewUrl(null);
    setRawCaptureUrl(null);
    setErr(null);
  }, [open, defaultTitle]);

  const patch = useCallback((partial: Partial<SiMapPrintSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const refreshPreview = useCallback(async () => {
    if (!open) return;
    setBusy(true);
    setErr(null);
    try {
      const raw = await captureSiMapPrintSnapshot({
        mapRef: mapRef.current,
        mapLoaded,
        extent: settings.extent,
        aoiFitBounds,
        basemapMode: settings.basemapMode,
        scale: settings.resolutionScale,
        prepareBasemap: preparePrintBasemap,
        restoreBasemap: restorePrintBasemap,
      });
      if (!raw) {
        setErr('Could not capture the map. Wait for tiles to finish loading, then try again.');
        setPreviewUrl(null);
        setRawCaptureUrl(null);
        return;
      }
      setRawCaptureUrl(raw);
      const composed = await composeSiMapPrintPage({
        mapPng: raw,
        settings,
        legendItems: settings.includeLegend ? legendItems : [],
        layerLines: settings.includeLayerList ? layerLines : [],
        mapLngLatBounds,
        metaLine,
      });
      setPreviewUrl(composed);
    } catch (e) {
      setErr((e as Error)?.message ?? 'Preview failed.');
      setPreviewUrl(null);
    } finally {
      setBusy(false);
    }
  }, [
    open,
    mapRef,
    mapLoaded,
    settings,
    aoiFitBounds,
    legendItems,
    layerLines,
    mapLngLatBounds,
    metaLine,
    preparePrintBasemap,
    restorePrintBasemap,
  ]);

  useEffect(() => {
    if (!open || !mapLoaded) return;
    const t = window.setTimeout(() => {
      void refreshPreview();
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, mapLoaded, refreshPreview]);

  useEffect(() => {
    if (!open || !mapLoaded || !settings.customLayout) return;
    const t = window.setTimeout(() => void refreshPreview(), 320);
    return () => window.clearTimeout(t);
  }, [settings.layoutOffsets, settings.customLayout, open, mapLoaded, refreshPreview]);

  const aspectStyle = useMemo(
    () => ({ aspectRatio: String(siMapPrintAspectRatio(settings)) }),
    [settings.paper, settings.orientation],
  );

  const layoutPlan = useMemo(
    () =>
      computeSiMapPrintLayout({
        settings,
        legendItems: settings.includeLegend ? legendItems : [],
        layerLines: settings.includeLayerList ? layerLines : [],
        metaLine,
      }),
    [settings, legendItems, layerLines, metaLine],
  );

  const onExportPdf = useCallback(() => {
    if (!previewUrl || !rawCaptureUrl) return;
    const stamp = new Date().toISOString().slice(0, 10);
    void exportSiMapPrintPdf(previewUrl, settings, `geosyntra-map-${stamp}.pdf`, {
      rawMapPng: rawCaptureUrl,
      legendItems: settings.includeLegend ? legendItems : [],
      layerLines: settings.includeLayerList ? layerLines : [],
      mapLngLatBounds,
      metaLine,
    });
  }, [previewUrl, rawCaptureUrl, settings, legendItems, layerLines, mapLngLatBounds, metaLine]);

  const resetLayoutOffsets = useCallback(() => {
    patch({ layoutOffsets: {} });
  }, [patch]);

  const onBrowserPrint = useCallback(() => {
    if (!previewUrl) return;
    triggerSiMapBrowserPrint(previewUrl, settings.title);
  }, [previewUrl, settings.title]);

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
                    ['includeLayerList', 'Layer credits'],
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
                Print opens your system dialog so you can pick a printer, paper tray, and copies. Export PDF keeps
                colours vivid{settings.vectorPdf ? ' with vector map chrome' : ''}.
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

          <footer className="si-map-print-actions">
            <button
              type="button"
              className="si-map-print-btn si-map-print-btn--ghost"
              onClick={() => void refreshPreview()}
              disabled={busy || !mapLoaded}
            >
              {busy ? 'Capturing…' : 'Preview refresh'}
            </button>
            <button
              type="button"
              className="si-map-print-btn"
              onClick={onBrowserPrint}
              disabled={!previewUrl || busy}
              title="Opens the browser print dialog to choose your printer"
            >
              <i className="fa-solid fa-print" aria-hidden /> Print…
            </button>
            <button
              type="button"
              className="si-map-print-btn si-map-print-btn--accent"
              onClick={onExportPdf}
              disabled={!previewUrl || !rawCaptureUrl || busy}
              title={settings.vectorPdf ? 'Vector PDF export' : 'Raster PDF export'}
            >
              <i className="fa-solid fa-file-pdf" aria-hidden /> {settings.vectorPdf ? 'Vector PDF' : 'PDF'}
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
              <div className="si-map-print-preview__sheet" style={aspectStyle}>
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
                {busy ? 'Rendering high-resolution preview…' : 'Press Preview refresh to capture the map.'}
              </p>
            )}
          </div>
          {busy ? <p className="si-map-print-preview__status">Updating preview…</p> : null}
          {err ? <p className="si-map-print-preview__err">{err}</p> : null}
        </div>
      </div>
    </div>
  );
}
