import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { SiPdfLngLatBounds } from '../utils/siAoiReportCartography';
import { captureSiMapPrintSnapshot } from '../utils/siMapPrintCapture';
import { composeSiMapPrintPage } from '../utils/siMapPrintComposer';
import { exportSiMapPrintPdf, triggerSiMapBrowserPrint } from '../utils/siMapPrintExport';
import {
  DEFAULT_SI_MAP_PRINT_SETTINGS,
  siMapPrintAspectRatio,
  siMapPrintPageLabel,
  type SiMapPrintSettings,
} from '../utils/siMapPrintTypes';
import type { SiAoiLegendStripItem } from '../utils/siAoiReportSlotMapRender';
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
}: SiMapPrintModalProps) {
  const [settings, setSettings] = useState<SiMapPrintSettings>(() => ({
    ...DEFAULT_SI_MAP_PRINT_SETTINGS,
    title: defaultTitle?.trim() || DEFAULT_SI_MAP_PRINT_SETTINGS.title,
  }));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSettings(s => ({
      ...s,
      title: defaultTitle?.trim() || s.title || DEFAULT_SI_MAP_PRINT_SETTINGS.title,
    }));
    setPreviewUrl(null);
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
        scale: settings.resolutionScale,
      });
      if (!raw) {
        setErr('Could not capture the map. Wait for tiles to finish loading, then try again.');
        setPreviewUrl(null);
        return;
      }
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
  ]);

  useEffect(() => {
    if (!open || !mapLoaded) return;
    const t = window.setTimeout(() => {
      void refreshPreview();
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, mapLoaded]);

  const aspectStyle = useMemo(
    () => ({ aspectRatio: String(siMapPrintAspectRatio(settings)) }),
    [settings.paper, settings.orientation],
  );

  const onExportPdf = useCallback(() => {
    if (!previewUrl) return;
    const stamp = new Date().toISOString().slice(0, 10);
    void exportSiMapPrintPdf(previewUrl, settings, `geosyntra-map-${stamp}.pdf`);
  }, [previewUrl, settings]);

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
            <div>
              <h2 id="si-map-print-title" className="si-map-print-modal__title">
                Map print preview
              </h2>
              <p className="si-map-print-modal__sub">
                Cartographic layout: map-first, breathing room, compact legend under the title, subtle north and scale on
                the map. Refresh after changing options.
              </p>
            </div>
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
              </div>
            </section>

            <section className="si-map-print-section" aria-labelledby="si-map-print-map-el">
              <h3 id="si-map-print-map-el" className="si-map-print-section__kicker">
                Map surrounds (minimal)
              </h3>
              <p className="si-map-print-hint">
                If it does not help read the map, leave it off. Layer credits appear in the footer when enabled.
              </p>
              <div className="si-map-print-toggles">
                {(
                  [
                    ['includeLegend', 'Index legend (compact)'],
                    ['includeScale', 'Scale bar (simple)'],
                    ['includeNorthArrow', 'North arrow (subtle)'],
                    ['includeLayerList', 'Layer credits in footer'],
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
            >
              <i className="fa-solid fa-print" aria-hidden /> Print
            </button>
            <button
              type="button"
              className="si-map-print-btn si-map-print-btn--accent"
              onClick={onExportPdf}
              disabled={!previewUrl || busy}
            >
              <i className="fa-solid fa-file-pdf" aria-hidden /> Export PDF
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
