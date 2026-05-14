import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { appAlert, appPrompt } from '../../../lib/appDialog';
import {
  type SiRasterSymbologyClassRow,
  type SiRasterSymbologyMethod,
  type SiRasterSymbologyRampId,
  type SiRasterSymbologyPreset,
  type SiRasterSymbologyState,
  siRasterSymbologyLoadPresets,
  siRasterSymbologyRampColors,
  siRasterSymbologyRecomputeClasses,
  siRasterSymbologySavePresets,
} from '../utils/siRasterSymbologyModel';
import './SiRasterSymbologyDrawer.css';

export type SiRasterSymbologyLayerOption = { id: string; label: string; group?: string };

export type SiRasterSymbologyDrawerProps = {
  open: boolean;
  onClose: () => void;
  hasAoi: boolean;
  layerOptions: SiRasterSymbologyLayerOption[];
  domain: { min: number; max: number };
  stats: { mean?: number; std?: number } | null;
  sampleValues: number[];
  value: SiRasterSymbologyState;
  onChange: (next: SiRasterSymbologyState) => void;
  onSyncMapLayer: (layerId: string) => void;
  onExportPng: () => void;
  onOpenPdfReport?: () => void;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const SiRasterSymbologyDrawer: React.FC<SiRasterSymbologyDrawerProps> = ({
  open,
  onClose,
  hasAoi,
  layerOptions,
  domain,
  stats,
  sampleValues,
  value,
  onChange,
  onSyncMapLayer,
  onExportPng,
  onOpenPdfReport,
}) => {
  const [presets, setPresets] = useState<SiRasterSymbologyPreset[]>(() => siRasterSymbologyLoadPresets());

  const rampChoices: { id: SiRasterSymbologyRampId; label: string }[] = useMemo(
    () => [
      { id: 'vegetation', label: 'Vegetation (R → Y → G)' },
      { id: 'water', label: 'Water (Br → Cy → Bl)' },
      { id: 'heat', label: 'Heat (Y → O → R)' },
      { id: 'terrain', label: 'Terrain (Br → G → W)' },
      { id: 'ai_detection', label: 'AI detection (Pu → Pi → Cy)' },
      { id: 'custom', label: 'Custom gradient' },
    ],
    [],
  );

  const methodChoices: { id: SiRasterSymbologyMethod; label: string }[] = useMemo(
    () => [
      { id: 'equal_interval', label: 'Equal interval' },
      { id: 'quantile', label: 'Quantile' },
      { id: 'natural_breaks', label: 'Natural breaks (Jenks-style)' },
      { id: 'std_dev', label: 'Standard deviation' },
      { id: 'manual', label: 'Manual breaks' },
    ],
    [],
  );

  const pushPresets = (next: SiRasterSymbologyPreset[]) => {
    setPresets(next);
    siRasterSymbologySavePresets(next);
  };

  const recompute = (patch: Partial<SiRasterSymbologyState>) => {
    const base: SiRasterSymbologyState = { ...value, ...patch };
    if (base.method === 'manual') {
      onChange(base);
      return;
    }
    onChange(siRasterSymbologyRecomputeClasses(base, domain.min, domain.max, sampleValues, stats));
  };

  const updateRow = (id: string, patch: Partial<SiRasterSymbologyClassRow>) => {
    const classes = value.classes.map(r => (r.id === id ? { ...r, ...patch } : r));
    onChange({ ...value, method: 'manual', classes });
  };

  const addRow = () => {
    const last = value.classes[value.classes.length - 1];
    const lo = last ? last.max : domain.min;
    const hi = domain.max;
    const mid = (lo + hi) / 2;
    const row: SiRasterSymbologyClassRow = {
      id: uid(),
      min: lo,
      max: Math.max(mid, lo + 1e-6),
      color: '#38bdf8',
      label: `Class ${value.classes.length + 1}`,
    };
    onChange({ ...value, method: 'manual', classes: [...value.classes, row] });
  };

  const removeRow = (id: string) => {
    if (value.classes.length <= 2) return;
    onChange({ ...value, method: 'manual', classes: value.classes.filter(r => r.id !== id) });
  };

  const savePreset = async () => {
    const name = await appPrompt('Preset name', `Symbology ${value.targetLayerId}`, { title: 'Save symbology preset' });
    const trimmed = name?.trim();
    if (!trimmed) return;
    const p: SiRasterSymbologyPreset = {
      id: uid(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      state: { ...value },
    };
    pushPresets([p, ...presets.filter(x => x.name.toLowerCase() !== trimmed.toLowerCase())]);
  };

  const loadPreset = (p: SiRasterSymbologyPreset) => {
    onChange(siRasterSymbologyRecomputeClasses({ ...p.state, method: p.state.method }, domain.min, domain.max, sampleValues, stats));
  };

  const exportPdf = async () => {
    try {
      const mapCanvas = document.querySelector('.mapboxgl-canvas') as HTMLCanvasElement | null;
      if (!mapCanvas) {
        await appAlert('Map canvas not found. Try again after the map finishes loading.', { title: 'Export PDF' });
        return;
      }
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const img = mapCanvas.toDataURL('image/png');
      const legendH = 12 + value.classes.length * 14;
      const mapH = Math.min(420, pageW * 0.72);
      pdf.setFontSize(11);
      pdf.text('Raster symbology export', 40, 36);
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(`Layer: ${value.targetLayerId} · Method: ${value.method} · Classes: ${value.classes.length}`, 40, 50);
      pdf.setTextColor(0);
      pdf.addImage(img, 'PNG', 40, 64, pageW - 80, mapH, undefined, 'FAST');
      let y = 72 + mapH;
      pdf.setFontSize(9);
      pdf.text('Legend', 40, y);
      y += 14;
      for (const c of value.classes) {
        pdf.setFillColor(c.color);
        pdf.rect(40, y - 8, 10, 10, 'F');
        pdf.setTextColor(40);
        pdf.text(`${c.label}  (${c.min.toFixed(2)} – ${c.max.toFixed(2)})`, 56, y);
        y += 14;
      }
      y += 8;
      pdf.setFontSize(7);
      pdf.setTextColor(100);
      pdf.text(`Opacity preview: ${Math.round(value.opacity * 100)}%`, 40, y + legendH * 0);
      pdf.save(`raster-symbology-${Date.now()}.pdf`);
    } catch (e) {
      void appAlert(String((e as Error)?.message ?? e), { title: 'PDF export failed' });
    }
  };

  const exportGeoTiff = () => {
    void appAlert(
      'GeoTIFF export needs a processed COG or STAC raster asset for this AOI. PNG captures the current styled map view; use Explore STAC or your processing pipeline for full GeoTIFF output.',
      { title: 'GeoTIFF export' },
    );
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            className="si-rs-sym-drawer__scrim"
            aria-label="Close symbology panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.aside
            className="si-rs-sym-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="si-rs-sym-drawer-title"
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <header className="si-rs-sym-drawer__head">
              <div>
                <div className="si-rs-sym-drawer__eyebrow">Remote sensing</div>
                <h2 id="si-rs-sym-drawer-title" className="si-rs-sym-drawer__title">
                  Reclassify & symbology
                </h2>
              </div>
              <button type="button" className="si-rs-sym-drawer__icon-btn" onClick={onClose} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </header>

            {!hasAoi ? (
              <p className="si-rs-sym-drawer__hint">Draw an AOI or pick a workspace AOI to enable live symbology.</p>
            ) : null}

            <div className="si-rs-sym-drawer__body">
              <label className="si-rs-sym-field">
                <span>Active raster / analysis layer</span>
                <select
                  value={value.targetLayerId}
                  onChange={e => {
                    const id = e.target.value;
                    onSyncMapLayer(id);
                    recompute({ targetLayerId: id });
                  }}
                >
                  {layerOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.group ? `${o.group} · ` : ''}
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="si-rs-sym-field">
                <span>Classification method</span>
                <select value={value.method} onChange={e => recompute({ method: e.target.value as SiRasterSymbologyMethod })}>
                  {methodChoices.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="si-rs-sym-field">
                <span>Number of classes ({value.classCount})</span>
                <input
                  type="range"
                  min={2}
                  max={15}
                  value={value.classCount}
                  onChange={e => recompute({ classCount: Number(e.target.value) })}
                />
              </label>

              <label className="si-rs-sym-field">
                <span>Color ramp</span>
                <select
                  value={value.rampId}
                  onChange={e => {
                    const rampId = e.target.value as SiRasterSymbologyRampId;
                    if (value.method === 'manual' && value.classes.length) {
                      const cols = siRasterSymbologyRampColors(rampId, value.customStops, value.classes.length);
                      onChange({
                        ...value,
                        rampId,
                        classes: value.classes.map((row, i) => ({ ...row, color: cols[i] ?? row.color })),
                      });
                    } else {
                      recompute({ rampId });
                    }
                  }}
                >
                  {rampChoices.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              {value.rampId === 'custom' ? (
                <div className="si-rs-sym-custom-ramp">
                  {(['Low', 'Mid', 'High'] as const).map((lab, i) => (
                    <label key={lab} className="si-rs-sym-mini">
                      <span>{lab}</span>
                      <input
                        type="color"
                        value={value.customStops[i] ?? '#000000'}
                        onChange={e => {
                          const next = [...value.customStops] as [string, string, string];
                          next[i] = e.target.value;
                          recompute({ customStops: next });
                        }}
                      />
                    </label>
                  ))}
                </div>
              ) : null}

              <label className="si-rs-sym-field">
                <span>Overlay opacity ({Math.round(value.opacity * 100)}%)</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(value.opacity * 100)}
                  onChange={e => onChange({ ...value, opacity: Number(e.target.value) / 100 })}
                />
              </label>

              <label className="si-rs-sym-toggle">
                <input
                  type="checkbox"
                  checked={value.showOnMap}
                  onChange={e => onChange({ ...value, showOnMap: e.target.checked })}
                />
                <span>Live preview on map (GPU / WebGL fill grid)</span>
              </label>

              <div className="si-rs-sym-legend">
                <div className="si-rs-sym-legend__title">Legend</div>
                <ul>
                  {value.classes.map(c => (
                    <li key={c.id}>
                      <span className="si-rs-sym-legend__swatch" style={{ background: c.color, opacity: value.opacity }} />
                      <span className="si-rs-sym-legend__txt">
                        <strong>{c.label}</strong>
                        <span className="si-rs-sym-legend__range">
                          {c.min.toFixed(3)} – {c.max.toFixed(3)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="si-rs-sym-table-wrap">
                <div className="si-rs-sym-table__head">
                  <span>Classes</span>
                  <button type="button" className="si-rs-sym-text-btn" onClick={addRow}>
                    + Add class
                  </button>
                </div>
                <table className="si-rs-sym-table">
                  <thead>
                    <tr>
                      <th>Min</th>
                      <th>Max</th>
                      <th>Color</th>
                      <th>Label</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {value.classes.map(row => (
                      <tr key={row.id}>
                        <td>
                          <input
                            className="si-rs-sym-num"
                            type="number"
                            step="0.001"
                            value={row.min}
                            onChange={e => updateRow(row.id, { min: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            className="si-rs-sym-num"
                            type="number"
                            step="0.001"
                            value={row.max}
                            onChange={e => updateRow(row.id, { max: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input type="color" value={row.color} onChange={e => updateRow(row.id, { color: e.target.value })} />
                        </td>
                        <td>
                          <input
                            className="si-rs-sym-label"
                            type="text"
                            value={row.label}
                            onChange={e => updateRow(row.id, { label: e.target.value })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="si-rs-sym-icon-danger"
                            aria-label="Remove class"
                            disabled={value.classes.length <= 2}
                            onClick={() => removeRow(row.id)}
                          >
                            <i className="fa-solid fa-trash" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="si-rs-sym-footnote">
                  Editing the table switches to <strong>Manual breaks</strong>. Choose another method to regenerate breaks.
                </p>
              </div>

              <div className="si-rs-sym-actions">
                <button type="button" className="si-rs-sym-btn si-rs-sym-btn--ghost" onClick={savePreset}>
                  Save preset
                </button>
                <div className="si-rs-sym-preset-row">
                  <select
                    className="si-rs-sym-preset-select"
                    defaultValue=""
                    onChange={e => {
                      const id = e.target.value;
                      const p = presets.find(x => x.id === id);
                      e.target.value = '';
                      if (p) loadPreset(p);
                    }}
                  >
                    <option value="" disabled>
                      Load preset…
                    </option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="si-rs-sym-export">
                <span className="si-rs-sym-export__label">Export</span>
                <div className="si-rs-sym-export__btns">
                  <button type="button" className="si-rs-sym-btn" onClick={onExportPng}>
                    PNG
                  </button>
                  <button type="button" className="si-rs-sym-btn si-rs-sym-btn--ghost" onClick={exportGeoTiff}>
                    GeoTIFF
                  </button>
                  <button type="button" className="si-rs-sym-btn si-rs-sym-btn--ghost" onClick={() => void exportPdf()}>
                    PDF
                  </button>
                  {onOpenPdfReport ? (
                    <button type="button" className="si-rs-sym-btn si-rs-sym-btn--ghost" onClick={onOpenPdfReport}>
                      AOI report
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
};
