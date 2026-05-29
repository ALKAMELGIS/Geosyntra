import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAiDetectionStore } from '../../../lib/aiDetection/store';
import {
  GEO_CART_AI_MODEL_PRESETS,
  matchGeoCartPresetToModel,
  resolveGeoCartPreset,
} from '../../../lib/aiDetection/geoCartAiCatalog';
import { resolveProcessingAoiGeometry, type MapBounds } from '../../../lib/aiDetection/environment';
import type { ImageryOption } from '../../../lib/aiDetection/types';
import './GeoCartAiComposerPanel.css';

const RESULTS_LAYER_ID = 'geo-cart-ai-results';

export type GeoCartAiComposerContext = {
  imageryOptions: ImageryOption[];
  aoiGeoJson: GeoJSON.GeoJSON | null;
  getMapBounds: () => MapBounds | null;
  getLayerBounds?: (layerId: string) => MapBounds | null;
  onPublishLayer: (layer: {
    id: string;
    name: string;
    geojson: GeoJSON.FeatureCollection;
    threshold: number;
  }) => void;
  /** Open full AI Detection GIS workspace in map toolbox. */
  onOpenWorkspace?: () => void;
};

export type GeoCartAiComposerPanelProps = {
  open: boolean;
  onClose: () => void;
  context: GeoCartAiComposerContext;
};

export function GeoCartAiComposerPanel({ open, onClose, context }: GeoCartAiComposerPanelProps) {
  const { imageryOptions, aoiGeoJson, getMapBounds, getLayerBounds, onPublishLayer, onOpenWorkspace } = context;
  const modelInputRef = useRef<HTMLInputElement>(null);
  const imageryInputRef = useRef<HTMLInputElement>(null);
  const [presetId, setPresetId] = useState(GEO_CART_AI_MODEL_PRESETS[0]!.id);
  const [uploadedImagery, setUploadedImagery] = useState<ImageryOption | null>(null);
  const [resultOpacity, setResultOpacity] = useState(0.72);
  const [minimized, setMinimized] = useState(false);

  const {
    environment,
    serviceOnline,
    models,
    selectedImageryId,
    selectedModelId,
    useGpu,
    params,
    activeJob,
    statusMessage,
    busy,
    modelPipelineStage,
    gpuAvailable,
    setImagery,
    setModel,
    setUseGpu,
    patchParams,
    refreshModels,
    refreshHealth,
    uploadModel,
    runDetection,
  } = useAiDetectionStore();

  const preset = resolveGeoCartPreset(presetId) ?? GEO_CART_AI_MODEL_PRESETS[0]!;

  const allImageryOptions = useMemo(() => {
    const base = [...imageryOptions];
    if (uploadedImagery && !base.some(o => o.id === uploadedImagery.id)) {
      return [uploadedImagery, ...base];
    }
    return base;
  }, [imageryOptions, uploadedImagery]);

  useEffect(() => {
    if (!open) return;
    void refreshHealth();
    void refreshModels();
  }, [open, refreshHealth, refreshModels]);

  useEffect(() => {
    if (!open || !models.length) return;
    const matched = matchGeoCartPresetToModel(preset, models);
    if (matched && matched.id !== selectedModelId) setModel(matched.id);
  }, [open, presetId, models, preset, selectedModelId, setModel]);

  useEffect(() => {
    if (selectedImageryId || !allImageryOptions[0]) return;
    setImagery(allImageryOptions[0].id);
  }, [allImageryOptions, selectedImageryId, setImagery]);

  const aoiGeometry = useMemo(
    () =>
      resolveProcessingAoiGeometry({
        environment,
        drawnAoi: aoiGeoJson,
        getMapBounds,
        getLayerBounds,
      }),
    [environment, aoiGeoJson, getMapBounds, getLayerBounds],
  );

  const progressPct = activeJob?.progress ?? 0;
  const canExecute =
    !busy && Boolean(selectedImageryId) && Boolean(selectedModelId) && Boolean(aoiGeometry);

  const handleImageryUpload = useCallback((file: File) => {
    const id = `upload:${Date.now()}`;
    setUploadedImagery({
      id,
      label: `Upload · ${file.name}`,
      kind: 'upload',
      group: 'raster',
    });
    setImagery(id);
  }, [setImagery]);

  const handleModelUpload = useCallback(
    (file: File) => {
      void uploadModel(file);
    },
    [uploadModel],
  );

  const handleExecute = useCallback(async () => {
    const fc = await runDetection(allImageryOptions, aoiGeometry);
    if (fc?.features?.length) {
      onPublishLayer({
        id: RESULTS_LAYER_ID,
        name: `${preset.label} results`,
        geojson: fc,
        threshold: params.threshold,
      });
    }
  }, [runDetection, allImageryOptions, aoiGeometry, onPublishLayer, preset.label, params.threshold]);

  if (!open) return null;

  return (
    <div
      className={
        'geo-cart-ai-panel' + (minimized ? ' geo-cart-ai-panel--min' : '') + (busy ? ' geo-cart-ai-panel--busy' : '')
      }
      role="dialog"
      aria-label="Geo-Cart AI spatial feature extraction"
    >
      <header className="geo-cart-ai-panel__head">
        <div className="geo-cart-ai-panel__brand">
          <i className="fa-solid fa-crosshairs" aria-hidden />
          <div>
            <h3 className="geo-cart-ai-panel__title">Geo-Cart AI</h3>
            <p className="geo-cart-ai-panel__subtitle">Spatial Feature Extraction</p>
          </div>
        </div>
        <div className="geo-cart-ai-panel__head-actions">
          <button
            type="button"
            className="geo-cart-ai-panel__icon-btn"
            aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
            onClick={() => setMinimized(m => !m)}
          >
            <i className={`fa-solid ${minimized ? 'fa-window-maximize' : 'fa-minus'}`} aria-hidden />
          </button>
          <button type="button" className="geo-cart-ai-panel__icon-btn" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </div>
      </header>

      {!minimized ? (
        <div className="geo-cart-ai-panel__body">
          <label className="geo-cart-ai-panel__field">
            <span className="geo-cart-ai-panel__label">Model</span>
            <select
              className="geo-cart-ai-panel__select"
              value={presetId}
              onChange={e => setPresetId(e.target.value)}
            >
              {GEO_CART_AI_MODEL_PRESETS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <div className="geo-cart-ai-panel__info" role="note">
            <i className="fa-solid fa-circle-info" aria-hidden />
            <div>
              <p>
                <strong>Res:</strong> {preset.resolution}
              </p>
              <p>
                <strong>Bands:</strong> {preset.bands}
              </p>
              <p className="geo-cart-ai-panel__info-hint">{preset.hint}</p>
              {!serviceOnline ? (
                <p className="geo-cart-ai-panel__info-warn">
                  API offline — preview mode uses client mock when AOI is set.
                </p>
              ) : null}
              {selectedModelId ? (
                <p className="geo-cart-ai-panel__info-model">
                  Active model: <code>{selectedModelId}</code>
                </p>
              ) : null}
            </div>
          </div>

          <label className="geo-cart-ai-panel__field">
            <span className="geo-cart-ai-panel__label">Input imagery</span>
            <select
              className="geo-cart-ai-panel__select"
              value={selectedImageryId}
              onChange={e => setImagery(e.target.value)}
            >
              {!allImageryOptions.length ? <option value="">No layers available</option> : null}
              {allImageryOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="geo-cart-ai-panel__upload-row">
            <input
              ref={imageryInputRef}
              type="file"
              accept="image/*,.tif,.tiff,.jp2"
              className="geo-cart-ai-panel__file-input"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleImageryUpload(f);
                e.target.value = '';
              }}
            />
            <input
              ref={modelInputRef}
              type="file"
              accept=".dlpk,.onnx,.pt,.pth,.zip"
              className="geo-cart-ai-panel__file-input"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleModelUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="geo-cart-ai-panel__upload-btn"
              onClick={() => imageryInputRef.current?.click()}
            >
              Choose imagery
            </button>
            <button type="button" className="geo-cart-ai-panel__upload-btn" onClick={() => modelInputRef.current?.click()}>
              Upload model
            </button>
          </div>

          <div className="geo-cart-ai-panel__mode" role="group" aria-label="Processing mode">
            <button
              type="button"
              className={'geo-cart-ai-panel__mode-btn' + (useGpu ? ' geo-cart-ai-panel__mode-btn--on' : '')}
              onClick={() => setUseGpu(true)}
              disabled={!gpuAvailable && serviceOnline}
              title={gpuAvailable ? 'GPU accelerated' : 'GPU unavailable'}
            >
              GPU (Fast)
            </button>
            <button
              type="button"
              className={'geo-cart-ai-panel__mode-btn' + (!useGpu ? ' geo-cart-ai-panel__mode-btn--on' : '')}
              onClick={() => setUseGpu(false)}
            >
              CPU (Safe)
            </button>
          </div>

          <label className="geo-cart-ai-panel__field geo-cart-ai-panel__field--slider">
            <span className="geo-cart-ai-panel__label">
              Result opacity <strong>{Math.round(resultOpacity * 100)}%</strong>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(resultOpacity * 100)}
              onChange={e => {
                const v = Number(e.target.value) / 100;
                setResultOpacity(v);
                patchParams({ threshold: Math.max(0.05, Math.min(0.95, params.threshold)) });
              }}
            />
          </label>

          {!aoiGeometry ? (
            <p className="geo-cart-ai-panel__aoi-hint">
              <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw an AOI on the map to define the processing extent.
            </p>
          ) : null}

          {busy || activeJob ? (
            <div className="geo-cart-ai-panel__progress" role="status">
              <div className="geo-cart-ai-panel__progress-bar" style={{ width: `${progressPct}%` }} />
              <span>{statusMessage || modelPipelineStage || `${progressPct}%`}</span>
            </div>
          ) : null}

          <button
            type="button"
            className="geo-cart-ai-panel__execute"
            disabled={!canExecute}
            onClick={() => void handleExecute()}
          >
            {busy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Running…
              </>
            ) : (
              <>Execute Model</>
            )}
          </button>

          {onOpenWorkspace ? (
            <button type="button" className="geo-cart-ai-panel__workspace-link" onClick={onOpenWorkspace}>
              Open full AI Detection workspace
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
