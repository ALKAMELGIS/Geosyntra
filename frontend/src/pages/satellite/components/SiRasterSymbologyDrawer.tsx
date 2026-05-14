import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { appAlert, appPrompt } from '../../../lib/appDialog';
import {
  type SiRasterSymbologyClassRow,
  type SiRasterSymbologyMethod,
  type SiRasterSymbologyRampId,
  type SiRasterSymbologyPreset,
  type SiRasterSymbologyState,
  type SiRasterSymbologyVizMode,
  siRasterSymbologyLoadPresets,
  siRasterSymbologyRampColors,
  siRasterSymbologyRecomputeClasses,
  siRasterSymbologySavePresets,
  siRasterSymbologyDefaultState,
} from '../utils/siRasterSymbologyModel';
import './SiRasterSymbologyDrawer.css';

export type SiRasterSymbologyLayerOption = { id: string; label: string; group?: string };

export type SiRasterSymbologyDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Floating portal keeps the map workspace clear; inline embeds in a parent panel. */
  presentation?: 'floating' | 'inline';
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
  presentation = 'floating',
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
  const isFloating = presentation === 'floating';
  const isCommitted = Boolean(value.reclassifyApplied);
  /** Edits before first Run/Apply stay local so the map index layer stays raw until the user commits. */
  const [preApplyDraft, setPreApplyDraft] = useState<SiRasterSymbologyState | null>(null);

  useEffect(() => {
    if (!open) {
      setPreApplyDraft(null);
      return;
    }
    if (isCommitted) {
      setPreApplyDraft(null);
      return;
    }
    const layer0 = value.targetLayerId;
    setPreApplyDraft(
      siRasterSymbologyRecomputeClasses(
        { ...siRasterSymbologyDefaultState(layer0), targetLayerId: layer0, showOnMap: true, reclassifyApplied: false },
        domain.min,
        domain.max,
        sampleValues,
        stats,
      ),
    );
    // Re-seed when the panel opens or the target layer changes — not on every stats tick (would wipe in-progress edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCommitted, value.targetLayerId]);

  const editing = isCommitted ? value : preApplyDraft ?? value;

  const pushEditing = useCallback(
    (next: SiRasterSymbologyState) => {
      if (isCommitted) onChange(next);
      else setPreApplyDraft(next);
    },
    [isCommitted, onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const rampChoices: { id: SiRasterSymbologyRampId; label: string }[] = useMemo(
    () => [
      { id: 'vegetation', label: 'Vegetation (R→Y→G)' },
      { id: 'water', label: 'Water' },
      { id: 'heat', label: 'Heat' },
      { id: 'terrain', label: 'Terrain' },
      { id: 'ai_detection', label: 'AI' },
      { id: 'custom', label: 'Custom' },
    ],
    [],
  );

  const methodChoices: { id: SiRasterSymbologyMethod; label: string }[] = useMemo(
    () => [
      { id: 'equal_interval', label: 'Equal interval' },
      { id: 'quantile', label: 'Quantile' },
      { id: 'natural_breaks', label: 'Natural breaks' },
      { id: 'std_dev', label: 'Std dev' },
      { id: 'manual', label: 'Manual' },
    ],
    [],
  );

  const pushPresets = (next: SiRasterSymbologyPreset[]) => {
    setPresets(next);
    siRasterSymbologySavePresets(next);
  };

  const recompute = (patch: Partial<SiRasterSymbologyState>) => {
    const base: SiRasterSymbologyState = { ...editing, ...patch };
    if (base.method === 'manual') {
      pushEditing(base);
      return;
    }
    pushEditing(siRasterSymbologyRecomputeClasses(base, domain.min, domain.max, sampleValues, stats));
  };

  const setVizMode = (vizMode: SiRasterSymbologyVizMode) => {
    if (vizMode === editing.vizMode) return;
    pushEditing({ ...editing, vizMode });
  };

  const updateRow = (id: string, patch: Partial<SiRasterSymbologyClassRow>) => {
    const classes = editing.classes.map(r => (r.id === id ? { ...r, ...patch } : r));
    pushEditing({ ...editing, method: 'manual', classes });
  };

  const addRow = () => {
    const last = editing.classes[editing.classes.length - 1];
    const lo = last ? last.max : domain.min;
    const hi = domain.max;
    const mid = (lo + hi) / 2;
    const row: SiRasterSymbologyClassRow = {
      id: uid(),
      min: lo,
      max: Math.max(mid, lo + 1e-6),
      color: '#38bdf8',
      label: `Class ${editing.classes.length + 1}`,
    };
    pushEditing({ ...editing, method: 'manual', classes: [...editing.classes, row] });
  };

  const removeRow = (id: string) => {
    if (editing.classes.length <= 2) return;
    pushEditing({ ...editing, method: 'manual', classes: editing.classes.filter(r => r.id !== id) });
  };

  const savePreset = async () => {
    const name = await appPrompt('Preset name', `Symbology ${editing.targetLayerId}`, { title: 'Save symbology preset' });
    const trimmed = name?.trim();
    if (!trimmed) return;
    const p: SiRasterSymbologyPreset = {
      id: uid(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      state: { ...editing, vizMode: editing.vizMode ?? 'classes', reclassifyApplied: false },
    };
    pushPresets([p, ...presets.filter(x => x.name.toLowerCase() !== trimmed.toLowerCase())]);
  };

  const loadPreset = (p: SiRasterSymbologyPreset) => {
    const st: SiRasterSymbologyState = {
      ...p.state,
      vizMode: p.state.vizMode === 'heatmap' ? 'heatmap' : 'classes',
      reclassifyApplied: false,
    };
    const next = siRasterSymbologyRecomputeClasses({ ...st, method: st.method }, domain.min, domain.max, sampleValues, stats);
    if (isCommitted) onChange({ ...next, reclassifyApplied: true, showOnMap: value.showOnMap });
    else setPreApplyDraft(next);
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
      const legendH = 12 + editing.classes.length * 14;
      const mapH = Math.min(420, pageW * 0.72);
      pdf.setFontSize(11);
      pdf.text('Raster symbology export', 40, 36);
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(`Layer: ${editing.targetLayerId} · Method: ${editing.method} · Classes: ${editing.classes.length}`, 40, 50);
      pdf.setTextColor(0);
      pdf.addImage(img, 'PNG', 40, 64, pageW - 80, mapH, undefined, 'FAST');
      let y = 72 + mapH;
      pdf.setFontSize(9);
      pdf.text('Legend', 40, y);
      y += 14;
      for (const c of editing.classes) {
        pdf.setFillColor(c.color);
        pdf.rect(40, y - 8, 10, 10, 'F');
        pdf.setTextColor(40);
        pdf.text(`${c.label}  (${c.min.toFixed(2)} – ${c.max.toFixed(2)})`, 56, y);
        y += 14;
      }
      y += 8;
      pdf.setFontSize(7);
      pdf.setTextColor(100);
      pdf.text(`Opacity preview: ${Math.round(editing.opacity * 100)}%`, 40, y + legendH * 0);
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

  const aside = (
    <aside
      id="si-rs-sym-panel"
      className={'si-rs-sym-drawer' + (isFloating ? ' si-rs-sym-drawer--floating' : ' si-rs-sym-drawer--inline')}
      role="dialog"
      aria-modal={isFloating}
      aria-labelledby="si-rs-sym-drawer-title"
      onClick={e => e.stopPropagation()}
    >
      <header className="si-rs-sym-drawer__head">
        <div>
          <h2 id="si-rs-sym-drawer-title" className="si-rs-sym-drawer__title">
            Reclassify &amp; symbology
          </h2>
          <p className="si-rs-sym-drawer__tagline">
            Breaks use raw index range ({domain.min.toFixed(3)} … {domain.max.toFixed(3)}). Preview grid spans that range by
            quantile (no synthetic waves) until per-pixel tiles drive each cell.
          </p>
        </div>
        <button type="button" className="si-rs-sym-drawer__icon-btn" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      {!hasAoi ? <p className="si-rs-sym-drawer__hint">Draw or pick an AOI to drive statistics and preview.</p> : null}

      <div className="si-rs-sym-drawer__body">
        <div className="si-rs-sym-viz-row" role="tablist" aria-label="Visualization mode">
          <button
            type="button"
            role="tab"
            aria-selected={editing.vizMode === 'classes'}
            className={'si-rs-sym-viz-btn' + (editing.vizMode === 'classes' ? ' si-rs-sym-viz-btn--on' : '')}
            onClick={() => setVizMode('classes')}
          >
            Classes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={editing.vizMode === 'heatmap'}
            className={'si-rs-sym-viz-btn' + (editing.vizMode === 'heatmap' ? ' si-rs-sym-viz-btn--on' : '')}
            onClick={() => setVizMode('heatmap')}
          >
            Heatmap
          </button>
        </div>

        <div className="si-rs-sym-controls-grid">
          <label className="si-rs-sym-field">
            <span>Layer</span>
            <select
              value={editing.targetLayerId}
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
            <span>Method</span>
            <select value={editing.method} onChange={e => recompute({ method: e.target.value as SiRasterSymbologyMethod })}>
              {methodChoices.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="si-rs-sym-field">
            <span>Classes ({editing.classCount})</span>
            <input
              type="range"
              min={2}
              max={15}
              value={editing.classCount}
              onChange={e => recompute({ classCount: Number(e.target.value) })}
              disabled={editing.vizMode === 'heatmap'}
            />
          </label>

          <label className="si-rs-sym-field">
            <span>Ramp</span>
            <select
              value={editing.rampId}
              onChange={e => {
                const rampId = e.target.value as SiRasterSymbologyRampId;
                if (editing.method === 'manual' && editing.classes.length) {
                  const cols = siRasterSymbologyRampColors(rampId, editing.customStops, editing.classes.length);
                  pushEditing({
                    ...editing,
                    rampId,
                    classes: editing.classes.map((row, i) => ({ ...row, color: cols[i] ?? row.color })),
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
        </div>

        {editing.rampId === 'custom' ? (
          <div className="si-rs-sym-custom-ramp">
            {(['Low', 'Mid', 'High'] as const).map((lab, i) => (
              <label key={lab} className="si-rs-sym-mini">
                <span>{lab}</span>
                <input
                  type="color"
                  value={editing.customStops[i] ?? '#000000'}
                  onChange={e => {
                    const next = [...editing.customStops] as [string, string, string];
                    next[i] = e.target.value;
                    recompute({ customStops: next });
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}

        <label className="si-rs-sym-field si-rs-sym-field--inline">
          <span>Opacity ({Math.round(editing.opacity * 100)}%)</span>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(editing.opacity * 100)}
            onChange={e => pushEditing({ ...editing, opacity: Number(e.target.value) / 100 })}
          />
        </label>

        <label className="si-rs-sym-toggle">
          <input
            type="checkbox"
            checked={editing.showOnMap}
            disabled={!isCommitted}
            onChange={e =>
              isCommitted
                ? onChange({ ...value, showOnMap: e.target.checked })
                : pushEditing({ ...editing, showOnMap: e.target.checked })
            }
          />
          <span>{isCommitted ? 'Show live reclassify overlay' : 'Show overlay on map (after Run / Apply)'}</span>
        </label>
        {!isCommitted ? (
          <p className="si-rs-sym-footnote si-rs-sym-footnote--pad">
            Map stays on raw index until you press <strong>Run / Apply</strong>. After that, edits update the overlay immediately; the WMS index layer is never modified.
          </p>
        ) : null}

        {editing.vizMode === 'heatmap' ? (
          <p className="si-rs-sym-footnote si-rs-sym-footnote--pad">
            Continuous ramp on cell property <span className="si-rs-sym-mono">v</span>, clamped to the same raw min/max as
            classification. Switch to Classes for stepped breaks.
          </p>
        ) : (
          <div className="si-rs-sym-table-wrap">
            <div className="si-rs-sym-table__head">
              <span>Breaks</span>
              <button type="button" className="si-rs-sym-text-btn" onClick={addRow}>
                + Class
              </button>
            </div>
            <div className="si-rs-sym-class-list">
              {editing.classes.map((row, idx) => (
                <div key={row.id} className="si-rs-sym-class-card">
                  <div className="si-rs-sym-class-card__top">
                    <span className="si-rs-sym-class-card__badge" title="Order">
                      {idx + 1}
                    </span>
                    <div className="si-rs-sym-class-card__breaks">
                      <label className="si-rs-sym-class-card__lbl">
                        <span>Min</span>
                        <input
                          className="si-rs-sym-num"
                          type="number"
                          step="0.001"
                          value={row.min}
                          onChange={e => updateRow(row.id, { min: Number(e.target.value) })}
                        />
                      </label>
                      <label className="si-rs-sym-class-card__lbl">
                        <span>Max</span>
                        <input
                          className="si-rs-sym-num"
                          type="number"
                          step="0.001"
                          value={row.max}
                          onChange={e => updateRow(row.id, { max: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                    <label className="si-rs-sym-class-card__color-wrap">
                      <span className="si-rs-sym-sr-only">Color</span>
                      <input
                        type="color"
                        className="si-rs-sym-class-card__color"
                        value={row.color}
                        onChange={e => updateRow(row.id, { color: e.target.value })}
                        aria-label={`Color for class ${idx + 1}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="si-rs-sym-icon-danger"
                      aria-label="Remove class"
                      disabled={editing.classes.length <= 2}
                      onClick={() => removeRow(row.id)}
                    >
                      <i className="fa-solid fa-trash" aria-hidden />
                    </button>
                  </div>
                  <label className="si-rs-sym-class-card__lbl si-rs-sym-class-card__lbl--full">
                    <span>Label</span>
                    <input
                      className="si-rs-sym-label si-rs-sym-label--block"
                      type="text"
                      value={row.label}
                      onChange={e => updateRow(row.id, { label: e.target.value })}
                      spellCheck={false}
                    />
                  </label>
                  <div className="si-rs-sym-class-card__range-hint" dir="ltr">
                    {row.min.toFixed(3)} – {row.max.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
            <p className="si-rs-sym-footnote">Editing breaks switches to Manual. Pick another method to recompute.</p>
          </div>
        )}

        {!isCommitted ? (
          <div className="si-rs-sym-apply-row">
            <button
              type="button"
              className="si-rs-sym-btn si-rs-sym-btn--primary"
              disabled={
                !preApplyDraft ||
                (preApplyDraft.vizMode === 'classes' && preApplyDraft.classes.length === 0)
              }
              onClick={() => {
                const d = preApplyDraft ?? editing;
                if (d.vizMode === 'classes' && !d.classes.length) return;
                onChange({ ...d, reclassifyApplied: true, showOnMap: true });
              }}
            >
              Run / Apply
            </button>
          </div>
        ) : null}

        <div className="si-rs-sym-actions si-rs-sym-actions--compact">
          <button type="button" className="si-rs-sym-btn si-rs-sym-btn--ghost" onClick={savePreset}>
            Save preset
          </button>
          <select
            className="si-rs-sym-preset-select"
            defaultValue=""
            aria-label="Load preset"
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
    </aside>
  );

  if (!open) return null;

  if (isFloating && typeof document !== 'undefined') {
    return createPortal(
      <div className="si-rs-sym-float-root">
        <button type="button" className="si-rs-sym-float-scrim" aria-label="Close symbology" onClick={onClose} />
        {aside}
      </div>,
      document.body,
    );
  }

  return aside;
};
