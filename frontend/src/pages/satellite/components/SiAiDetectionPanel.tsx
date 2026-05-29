import { useEffect, useMemo, useRef, useState } from 'react'
import { useAiDetectionStore } from '../../../lib/aiDetection/store'
import { IMAGERY_GROUP_LABEL } from '../../../lib/aiDetection/buildImageryInputOptions'
import {
  ARCGIS_MODEL_URL_PLACEHOLDER,
  isLikelyModelSourceUrl,
  normalizeArcgisItemRestUrl,
} from '../../../lib/aiDetection/arcgisModelUrl'
import { resolveProcessingAoiGeometry, type MapBounds } from '../../../lib/aiDetection/environment'
import { DETECTION_ARGUMENT_FIELDS } from '../../../lib/aiDetection/detectionArguments'
import type {
  AiModelInfo,
  AiModelParameters,
  AiModelPipelineStage,
  ImageryInputGroup,
  ImageryOption,
} from '../../../lib/aiDetection/types'
import { SiAiDetectionEnvironmentsPanel } from './SiAiDetectionEnvironmentsPanel'
import { SiAoiDrawingToolbar } from './aoi/SiAoiDrawingToolbar'
import type {
  AoiDrawShapeTool,
  AoiGeometryEditSubTool,
  MapDrawTool,
  SiMapInteractionMode,
} from './aoi/siAoiModuleTypes'
import './siAiDetectionPanel.css'

const RESULTS_LAYER_ID = 'ai-detection-gis-results'

export type SiAiDetectionPanelProps = {
  imageryOptions: ImageryOption[]
  aoiGeoJson: GeoJSON.GeoJSON | null
  getMapBounds: () => MapBounds | null
  getLayerBounds?: (layerId: string) => MapBounds | null
  mapCrsLabel?: string
  interactionMode: SiMapInteractionMode
  onInteractionMode: (mode: SiMapInteractionMode) => void
  drawShape: AoiDrawShapeTool
  onDrawShape: (shape: AoiDrawShapeTool) => void
  hasMoveSelection: boolean
  mapTool: MapDrawTool
  onMapTool: (tool: MapDrawTool) => void
  hasClearableDrawing: boolean
  drawAssistHint?: string
  onClearDrawing: () => void
  hasEditableGeometry?: boolean
  aoiEditEnabled?: boolean
  onToggleAoiEdit?: () => void
  aoiEditSubTool?: AoiGeometryEditSubTool
  onAoiEditSubTool?: (tool: AoiGeometryEditSubTool) => void
  aoiEditShowAllVertices?: boolean
  onToggleAoiEditAllVertices?: () => void
  onRequestDrawExtent?: () => void
  onPublishLayer: (layer: {
    id: string
    name: string
    geojson: GeoJSON.FeatureCollection
    threshold: number
  }) => void
}

const PIPELINE_STAGE_LABEL: Record<AiModelPipelineStage, string> = {
  idle: '',
  uploading: 'Uploading file…',
  validating: 'Validating package…',
  parsing: 'Parsing metadata (EMD)…',
  registering: 'Registering model…',
  ready: 'Model ready',
  error: 'Pipeline failed',
}

function ModelManifestCard({ model }: { model: AiModelInfo }) {
  const size =
    model.input_size?.width && model.input_size?.height
      ? `${model.input_size.width} × ${model.input_size.height}`
      : '—'
  return (
    <div
      className={`si-ai-detect__model-manifest${model.validated === false ? ' si-ai-detect__model-manifest--warn' : ''}`}
      role="status"
    >
      <p className="si-ai-detect__model-manifest-title">
        <i className="fa-solid fa-cube" aria-hidden />
        {model.name}
        <span className="si-ai-detect__model-manifest-kind">{model.kind ?? 'model'}</span>
      </p>
      <dl className="si-ai-detect__model-manifest-grid">
        <div>
          <dt>Framework</dt>
          <dd>{model.framework}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{model.model_type}</dd>
        </div>
        <div>
          <dt>Input size</dt>
          <dd>{size}</dd>
        </div>
        <div>
          <dt>GPU</dt>
          <dd>{model.gpu_required ? 'Required / recommended' : 'Optional'}</dd>
        </div>
        <div className="si-ai-detect__model-manifest-classes">
          <dt>Classes</dt>
          <dd>{model.classes?.length ? model.classes.join(', ') : '—'}</dd>
        </div>
      </dl>
      {model.validation_errors?.length ? (
        <p className="si-ai-detect__model-manifest-warn">{model.validation_errors.join(' · ')}</p>
      ) : null}
    </div>
  )
}

function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function SiAiDetectionPanel({
  imageryOptions,
  aoiGeoJson,
  getMapBounds,
  getLayerBounds,
  mapCrsLabel,
  interactionMode,
  onInteractionMode,
  drawShape,
  onDrawShape,
  hasMoveSelection,
  mapTool,
  onMapTool,
  hasClearableDrawing,
  onClearDrawing,
  drawAssistHint,
  hasEditableGeometry = false,
  aoiEditEnabled = false,
  onToggleAoiEdit,
  aoiEditSubTool = 'vertex',
  onAoiEditSubTool,
  aoiEditShowAllVertices = false,
  onToggleAoiEditAllVertices,
  onRequestDrawExtent,
  onPublishLayer,
}: SiAiDetectionPanelProps) {
  const modelInputRef = useRef<HTMLInputElement>(null)
  const imageryInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<'parameters' | 'environments'>('parameters')
  const [uploadedImagery, setUploadedImagery] = useState<ImageryOption | null>(null)
  const [outputLayerName, setOutputLayerName] = useState('AI_detected_objects')
  const [autoPublish, setAutoPublish] = useState(true)
  const [lastResult, setLastResult] = useState<GeoJSON.FeatureCollection | null>(null)
  const [modelWebUrl, setModelWebUrl] = useState('')

  const {
    environment,
    serviceOnline,
    models,
    jobHistory,
    selectedImageryId,
    selectedModelId,
    params,
    activeJob,
    statusMessage,
    busy,
    modelPipelineStage,
    registeredModel,
    setImagery,
    setModel,
    patchParams,
    patchEnvironment,
    refreshModels,
    refreshHealth,
    uploadModel,
    importModelFromUrl,
    runDetection,
    loadJobHistory,
  } = useAiDetectionStore()

  /** Mount-only: health/models/history. Avoid unstable callback deps (infinite loop with parent). */
  useEffect(() => {
    void refreshHealth()
    void refreshModels()
    void loadJobHistory()
    const poll = window.setInterval(() => void refreshHealth(), 12000)
    return () => window.clearInterval(poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount init
  }, [])

  const allImageryOptions = useMemo(() => {
    const base = [...imageryOptions]
    if (uploadedImagery && !base.some(o => o.id === uploadedImagery.id)) {
      return [uploadedImagery, ...base]
    }
    return base
  }, [imageryOptions, uploadedImagery])

  const activeModelDetail = useMemo(() => {
    if (registeredModel && registeredModel.id === selectedModelId) return registeredModel
    return models.find(m => m.id === selectedModelId) ?? registeredModel
  }, [models, registeredModel, selectedModelId])

  const pipelineLabel = PIPELINE_STAGE_LABEL[modelPipelineStage]

  const imageryByGroup = useMemo(() => {
    const order: ImageryInputGroup[] = ['live', 'raster', 'services']
    const map = new Map<ImageryInputGroup, ImageryOption[]>()
    for (const g of order) map.set(g, [])
    for (const opt of allImageryOptions) {
      const bucket = map.get(opt.group) ?? []
      bucket.push(opt)
      map.set(opt.group, bucket)
    }
    return order
      .map(group => ({ group, label: IMAGERY_GROUP_LABEL[group], options: map.get(group) ?? [] }))
      .filter(row => row.options.length > 0)
  }, [allImageryOptions])

  const defaultImageryId = allImageryOptions[0]?.id ?? ''
  useEffect(() => {
    if (selectedImageryId || !defaultImageryId) return
    setImagery(defaultImageryId)
  }, [defaultImageryId, selectedImageryId, setImagery])

  const aoiGeometry = useMemo(
    () =>
      resolveProcessingAoiGeometry({
        environment,
        drawnAoi: aoiGeoJson,
        getMapBounds,
        getLayerBounds,
      }),
    [environment, aoiGeoJson, getMapBounds, getLayerBounds],
  )
  const progressPct = activeJob?.progress ?? 0

  const handleMapTool = (tool: MapDrawTool) => {
    patchEnvironment({ extentSource: 'drawn' })
    onMapTool(tool)
  }

  const runHint = !selectedImageryId
    ? 'Select input raster'
    : !selectedModelId
      ? 'Upload or import a model'
      : !aoiGeometry
        ? 'Draw AOI on the map'
        : !serviceOnline
          ? 'Run preview (API offline)'
          : 'Run GPU detection'

  const patchArgument = (key: keyof AiModelParameters, raw: string) => {
    const field = DETECTION_ARGUMENT_FIELDS.find(f => f.key === key)
    if (field?.kind === 'boolean') {
      patchParams({ [key]: raw === 'true' } as Partial<AiModelParameters>)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    patchParams({ [key]: n } as Partial<AiModelParameters>)
  }

  const publishResult = (fc: GeoJSON.FeatureCollection) => {
    onPublishLayer({
      id: RESULTS_LAYER_ID,
      name: outputLayerName.trim() || 'AI Detection results',
      geojson: fc,
      threshold: params.threshold,
    })
  }

  const handleRun = async () => {
    const fc = await runDetection(allImageryOptions, aoiGeometry)
    if (fc?.features?.length) {
      setLastResult(fc)
      if (autoPublish) publishResult(fc)
    }
  }

  const handlePublish = () => {
    if (lastResult?.features?.length) publishResult(lastResult)
  }

  const canRun =
    !busy && Boolean(selectedImageryId) && Boolean(selectedModelId) && Boolean(aoiGeometry) && Boolean(activeModelDetail)

  return (
    <div className="si-ai-detect si-env-section-card">
      <div className="si-ai-detect__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'parameters'}
          className={activeTab === 'parameters' ? 'is-active' : ''}
          onClick={() => setActiveTab('parameters')}
        >
          Parameters
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'environments'}
          className={activeTab === 'environments' ? 'is-active' : ''}
          onClick={() => setActiveTab('environments')}
        >
          Environments
        </button>
      </div>

      {activeTab === 'parameters' ? (
        <div className="si-ai-detect__params">
          <div className="si-ai-detect__param">
            <label className="si-ai-detect__param-label">
              <span className="si-ai-detect__required" aria-hidden>
                *
              </span>
              Input raster
            </label>
            <div className="si-ai-detect__param-control">
              <select
                className="si-ai-detect__select"
                value={selectedImageryId}
                onChange={e => setImagery(e.target.value)}
              >
                {!allImageryOptions.length ? <option value="">No raster layers available</option> : null}
                {imageryByGroup.map(({ group, label, options }) => (
                  <optgroup key={group} label={label}>
                    {options.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                className="si-ai-detect__browse"
                title="Upload imagery"
                onClick={() => imageryInputRef.current?.click()}
              >
                <i className="fa-solid fa-folder-open" aria-hidden />
              </button>
            </div>
            <input
              ref={imageryInputRef}
              type="file"
              accept=".tif,.tiff,.jp2,.png,.jpg,.jpeg,.geotiff"
              className="si-ai-detect__file"
              onChange={e => {
                const f = e.target.files?.[0]
                if (!f) return
                const id = `upload:${f.name}`
                const opt: ImageryOption = {
                  id,
                  kind: 'raster_dataset',
                  group: 'raster',
                  label: `Raster Dataset · ${f.name}`,
                }
                setUploadedImagery(opt)
                setImagery(id)
                useAiDetectionStore.setState({
                  statusMessage: `Raster “${f.name}” selected — full tile inference requires the AI service when online.`,
                })
                e.target.value = ''
              }}
            />
          </div>

          <div className="si-ai-detect__param">
            <label className="si-ai-detect__param-label">
              <span className="si-ai-detect__required" aria-hidden>
                *
              </span>
              Output detected objects
            </label>
            <div className="si-ai-detect__param-control">
              <input
                className="si-ai-detect__text"
                value={outputLayerName}
                onChange={e => setOutputLayerName(e.target.value)}
                placeholder="Feature class name"
              />
              <button type="button" className="si-ai-detect__browse" title="Layer output name">
                <i className="fa-solid fa-layer-group" aria-hidden />
              </button>
            </div>
          </div>

          <div className="si-ai-detect__param si-ai-detect__param--model">
            <div className="si-ai-detect__param-label-row">
              <label className="si-ai-detect__param-label">
                <span className="si-ai-detect__required" aria-hidden>
                  *
                </span>
                Model definition
              </label>
              <div className="si-ai-detect__model-actions">
                <button type="button" className="si-ai-detect__link-btn" onClick={() => modelInputRef.current?.click()}>
                  Upload
                </button>
              </div>
            </div>
            <input
              ref={modelInputRef}
              type="file"
              accept=".dlpk,.onnx,.pt,.pth"
              className="si-ai-detect__file"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void uploadModel(f)
                e.target.value = ''
              }}
            />
            <div className="si-ai-detect__model-web">
              <input
                type="url"
                className="si-ai-detect__text si-ai-detect__text--url"
                value={modelWebUrl}
                placeholder={ARCGIS_MODEL_URL_PLACEHOLDER}
                aria-label="ArcGIS item or model file URL"
                onChange={e => setModelWebUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && modelWebUrl.trim()) {
                    e.preventDefault()
                    void importModelFromUrl(normalizeArcgisItemRestUrl(modelWebUrl)).then(() =>
                      setModelWebUrl(''),
                    )
                  }
                }}
              />
              <button
                type="button"
                className="si-ai-detect__import-url"
                disabled={busy || !isLikelyModelSourceUrl(modelWebUrl)}
                title="Import .dlpk from ArcGIS Portal item URL"
                onClick={() => {
                  const url = normalizeArcgisItemRestUrl(modelWebUrl)
                  void importModelFromUrl(url).then(() => setModelWebUrl(''))
                }}
              >
                <i className="fa-solid fa-cloud-arrow-down" aria-hidden />
                Web
              </button>
            </div>
            {pipelineLabel ? (
              <p className="si-ai-detect__pipeline-stage" aria-live="polite">
                <i className={`fa-solid fa-gears${busy ? ' fa-spin' : ''}`} aria-hidden />
                {pipelineLabel}
              </p>
            ) : null}
            {activeModelDetail ? <ModelManifestCard model={activeModelDetail} /> : null}
            <div className="si-ai-detect__param-control">
              <select
                className="si-ai-detect__select"
                value={selectedModelId}
                onChange={e => setModel(e.target.value)}
              >
                <option value="">Select model…</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.framework}
                  </option>
                ))}
              </select>
              <button type="button" className="si-ai-detect__browse" onClick={() => modelInputRef.current?.click()}>
                <i className="fa-solid fa-folder-open" aria-hidden />
              </button>
            </div>
          </div>

          <div className="si-ai-detect__param si-ai-detect__param--aoi">
            <label className="si-ai-detect__param-label">Objects of interest (AOI)</label>
            <div className="si-ai-detect__aoi-block">
              <SiAoiDrawingToolbar
                variant="embedded"
                interactionMode={interactionMode}
                onInteractionMode={mode => {
                  patchEnvironment({ extentSource: 'drawn' })
                  onInteractionMode(mode)
                }}
                drawShape={drawShape}
                onDrawShape={shape => {
                  patchEnvironment({ extentSource: 'drawn' })
                  onDrawShape(shape)
                }}
                hasMoveSelection={hasMoveSelection}
                drawAssistHint={drawAssistHint}
                hasClearableDrawing={hasClearableDrawing}
                onClearDrawing={onClearDrawing}
                hasEditableGeometry={hasEditableGeometry}
                aoiEditEnabled={aoiEditEnabled}
                onToggleAoiEdit={onToggleAoiEdit}
                aoiEditSubTool={aoiEditSubTool}
                onAoiEditSubTool={onAoiEditSubTool}
                aoiEditShowAllVertices={aoiEditShowAllVertices}
                onToggleAoiEditAllVertices={onToggleAoiEditAllVertices}
              />
            </div>
          </div>

          <div className="si-ai-detect__param si-ai-detect__param--args">
            <label className="si-ai-detect__param-label">Arguments</label>
            {!activeModelDetail ? (
              <p className="si-ai-detect__args-placeholder">Select a model definition to view detection arguments.</p>
            ) : (
              <div className="si-ai-detect__args-form" role="group" aria-label="Detection arguments">
                {activeModelDetail.classes?.length ? (
                  <p className="si-ai-detect__args-model-note">
                    Model classes: {activeModelDetail.classes.join(', ')}
                  </p>
                ) : null}
                {DETECTION_ARGUMENT_FIELDS.map(field => (
                  <div key={field.key} className="si-ai-detect__args-field">
                    <label className="si-ai-detect__args-label" htmlFor={`si-ai-arg-${field.key}`}>
                      {field.label}
                    </label>
                    {field.kind === 'boolean' ? (
                      <select
                        id={`si-ai-arg-${field.key}`}
                        className="si-ai-detect__args-input"
                        value={params[field.key] ? 'true' : 'false'}
                        onChange={e => patchArgument(field.key, e.target.value)}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : (
                      <input
                        id={`si-ai-arg-${field.key}`}
                        type="number"
                        className="si-ai-detect__args-input"
                        value={params[field.key]}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onChange={e => patchArgument(field.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="si-ai-detect__check">
            <input type="checkbox" checked={autoPublish} onChange={e => setAutoPublish(e.target.checked)} />
            Publish output layer to map when inference completes
          </label>
        </div>
      ) : (
        <SiAiDetectionEnvironmentsPanel
          imageryOptions={allImageryOptions}
          mapCrsLabel={mapCrsLabel}
          getMapBounds={getMapBounds}
          onRequestDrawExtent={onRequestDrawExtent}
        />
      )}

      <footer className="si-ai-detect__footer">
        <button
          type="button"
          className="si-ai-detect__publish"
          disabled={!lastResult?.features?.length}
          onClick={handlePublish}
          title="Publish last result to the map"
        >
          <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden />
          Publish layer
        </button>
        <button
          type="button"
          className="si-ai-detect__run"
          disabled={!canRun}
          onClick={() => void handleRun()}
          title={runHint}
        >
          <i className="fa-solid fa-play" aria-hidden />
          {busy ? 'Running…' : 'Run'}
        </button>
      </footer>

      {activeJob ? (
        <section className="si-ai-detect__progress" aria-live="polite">
          <div className="si-ai-detect__progress-head">
            <span>Processing tiles…</span>
            <strong>{progressPct.toFixed(0)}%</strong>
          </div>
          <div className="si-ai-detect__progress-bar">
            <span style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
          <div className="si-ai-detect__progress-meta">
            <span>
              Tile {activeJob.tiles_done} / {activeJob.tiles_total || '—'}
            </span>
            <span>GPU {activeJob.gpu_usage_pct != null ? `${Math.round(activeJob.gpu_usage_pct)}%` : '—'}</span>
            <span>ETA {formatEta(activeJob.eta_seconds)}</span>
          </div>
        </section>
      ) : null}

      {statusMessage ? <p className="si-ai-detect__flash">{statusMessage}</p> : null}

      {jobHistory.length ? (
        <section className="si-ai-detect__history-block">
          <label className="si-ai-detect__param-label">Recent jobs</label>
          <ul className="si-ai-detect__history">
            {jobHistory.slice(0, 5).map(job => (
              <li key={job.job_id}>
                <span>{job.status}</span>
                <em>{job.message || job.job_id.slice(0, 8)}</em>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
