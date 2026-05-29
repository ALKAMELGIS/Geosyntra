import { create } from 'zustand'
import {
  createAiDetectionJob,
  fetchAiHealth,
  getAiJob,
  listAiJobHistory,
  listAiModels,
  uploadAiModel,
  importAiModelFromUrl,
  aiJobWebSocketUrl,
} from './api'
import { resolveImageryApiType } from './buildImageryInputOptions'
import {
  loadAiDetectionEnvironment,
  saveAiDetectionEnvironment,
  type AiDetectionEnvironment,
} from './environment'
import { formatAiModelSummary } from './api'
import { runClientMockDetection } from './clientMockDetection'
import {
  DEFAULT_AI_PARAMS,
  type AiJobProgress,
  type AiModelInfo,
  type AiModelParameters,
  type AiModelPipelineStage,
  type ImageryOption,
} from './types'

type AiDetectionState = {
  gpuAvailable: boolean
  serviceOnline: boolean
  models: AiModelInfo[]
  jobHistory: AiJobProgress[]
  selectedImageryId: string
  selectedModelId: string
  useGpu: boolean
  environment: AiDetectionEnvironment
  params: AiModelParameters
  activeJob: AiJobProgress | null
  statusMessage: string
  busy: boolean
  modelPipelineStage: AiModelPipelineStage
  registeredModel: AiModelInfo | null
  setImagery: (id: string) => void
  setModel: (id: string) => void
  setUseGpu: (v: boolean) => void
  patchEnvironment: (p: Partial<AiDetectionEnvironment>) => void
  patchParams: (p: Partial<AiModelParameters>) => void
  refreshModels: () => Promise<void>
  refreshHealth: () => Promise<void>
  uploadModel: (file: File) => Promise<void>
  importModelFromUrl: (url: string) => Promise<void>
  runDetection: (imageryOptions: ImageryOption[], aoi: GeoJSON.Geometry | null) => Promise<GeoJSON.FeatureCollection | null>
  loadJobHistory: () => Promise<void>
  resetJob: () => void
}

function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export const useAiDetectionStore = create<AiDetectionState>((set, get) => ({
  gpuAvailable: false,
  serviceOnline: false,
  models: [],
  jobHistory: [],
  selectedImageryId: '',
  selectedModelId: '',
  useGpu: true,
  environment: loadAiDetectionEnvironment(),
  params: { ...DEFAULT_AI_PARAMS },
  activeJob: null,
  statusMessage: '',
  busy: false,
  modelPipelineStage: 'idle',
  registeredModel: null,

  setImagery: id => set({ selectedImageryId: id }),
  setModel: id => set({ selectedModelId: id }),
  setUseGpu: v => set({ useGpu: v }),
  patchEnvironment: p =>
    set(s => {
      const environment = { ...s.environment, ...p }
      saveAiDetectionEnvironment(environment)
      return { environment }
    }),
  patchParams: p => set(s => ({ params: { ...s.params, ...p } })),

  refreshHealth: async () => {
    try {
      const h = await fetchAiHealth()
      set({ serviceOnline: h.ok, gpuAvailable: h.gpu_available })
    } catch {
      set({ serviceOnline: false, gpuAvailable: false })
    }
  },

  refreshModels: async () => {
    try {
      const models = await listAiModels()
      set(s => ({
        models,
        selectedModelId: s.selectedModelId || models[0]?.id || '',
      }))
    } catch {
      set({ models: [] })
    }
  },

  uploadModel: async file => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    set({
      busy: true,
      modelPipelineStage: 'uploading',
      statusMessage: `Uploading ${file.name}…`,
      registeredModel: null,
    })
    try {
      set({ modelPipelineStage: 'validating', statusMessage: 'Validating package type…' })
      if (ext === 'dlpk') {
        set({ modelPipelineStage: 'parsing', statusMessage: 'Parsing .dlpk — reading EMD metadata…' })
      }
      set({ modelPipelineStage: 'registering', statusMessage: 'Registering model on AI Detection service…' })
      const model = await uploadAiModel(file)
      await get().refreshModels()
      set({
        selectedModelId: model.id,
        registeredModel: model,
        modelPipelineStage: model.validated === false ? 'error' : 'ready',
        statusMessage:
          model.validated === false
            ? `Model registered with warnings: ${(model.validation_errors ?? []).join('; ') || 'see details'}`
            : `Ready: ${formatAiModelSummary(model)}`,
      })
    } catch (e) {
      set({
        modelPipelineStage: 'error',
        statusMessage: e instanceof Error ? e.message : 'Upload failed',
        registeredModel: null,
      })
    } finally {
      set({ busy: false })
    }
  },

  importModelFromUrl: async url => {
    set({
      busy: true,
      modelPipelineStage: 'uploading',
      statusMessage: 'Downloading model from ArcGIS / web…',
      registeredModel: null,
    })
    try {
      set({ modelPipelineStage: 'validating', statusMessage: 'Validating download…' })
      set({ modelPipelineStage: 'parsing', statusMessage: 'Parsing deep learning package…' })
      set({ modelPipelineStage: 'registering', statusMessage: 'Registering model…' })
      const model = await importAiModelFromUrl(url)
      await get().refreshModels()
      set({
        selectedModelId: model.id,
        registeredModel: model,
        modelPipelineStage: model.validated === false ? 'error' : 'ready',
        statusMessage:
          model.validated === false
            ? `Imported with warnings: ${(model.validation_errors ?? []).join('; ') || 'see details'}`
            : `Ready: ${formatAiModelSummary(model)}`,
      })
    } catch (e) {
      set({
        modelPipelineStage: 'error',
        statusMessage: e instanceof Error ? e.message : 'URL import failed',
        registeredModel: null,
      })
    } finally {
      set({ busy: false })
    }
  },

  loadJobHistory: async () => {
    try {
      const jobHistory = await listAiJobHistory()
      set({ jobHistory })
    } catch {
      set({ jobHistory: [] })
    }
  },

  resetJob: () => set({ activeJob: null }),

  runDetection: async (imageryOptions, aoi) => {
    const { selectedImageryId, selectedModelId, useGpu, params, environment } = get()
    if (!selectedImageryId) {
      set({ statusMessage: 'Select or upload input raster imagery.' })
      return null
    }
    if (!selectedModelId) {
      set({ statusMessage: 'Select or upload a model definition (.dlpk, .onnx, .pt).' })
      return null
    }
    const activeModel = get().models.find(m => m.id === selectedModelId) ?? get().registeredModel
    if (activeModel?.validated === false) {
      set({
        statusMessage: `Model “${activeModel.name}” is not valid for inference: ${(activeModel.validation_errors ?? []).join('; ') || 'fix package'}`,
      })
      return null
    }
    if (!aoi) {
      set({ statusMessage: 'Draw an AOI polygon on the map before running inference.' })
      return null
    }

    if (!get().serviceOnline) {
      set({ busy: true, statusMessage: 'Running browser preview (AI Detection API offline)…' })
      try {
        const fc = runClientMockDetection({ aoi, model: activeModel, params })
        set({
          statusMessage: `Preview complete — ${fc.features.length} objects. Start docker compose -f docker-compose.ai.yml for GPU inference.`,
        })
        return fc
      } finally {
        set({ busy: false })
      }
    }

    set({ busy: true, statusMessage: 'Starting GPU detection job…' })
    try {
      const imagery = imageryOptions.find(o => o.id === selectedImageryId)
      const imagery_type = resolveImageryApiType(selectedImageryId, imagery?.kind)
      const job = await createAiDetectionJob({
        imagery_source: selectedImageryId,
        imagery_type,
        model_id: selectedModelId,
        aoi_geojson: aoi,
        use_gpu: useGpu,
        gpu_device: '0',
        tile_size: environment.tileSize || 512,
        parallel_factor: environment.parallelFactor || undefined,
        mask_layer_id: environment.maskLayerId || undefined,
        cell_size_mode: environment.cellSizeMode,
        cell_size_value: environment.cellSizeValue || undefined,
        extent_source: environment.extentSource,
        params,
      })
      set({ activeJob: job })

      const pollJob = async (): Promise<GeoJSON.FeatureCollection> => {
        for (let i = 0; i < 240; i++) {
          const polled = await getAiJob(job.job_id)
          set({
            activeJob: polled,
            statusMessage:
              polled.message ||
              `Tile ${polled.tiles_done} / ${polled.tiles_total} · ETA ${formatEta(polled.eta_seconds)}`,
          })
          if (polled.status === 'completed' && polled.result_geojson) {
            return polled.result_geojson as GeoJSON.FeatureCollection
          }
          if (polled.status === 'failed') throw new Error(polled.error || 'Detection failed')
          await new Promise(r => window.setTimeout(r, 500))
        }
        throw new Error('Job timed out')
      }

      const waitWs = (): Promise<GeoJSON.FeatureCollection> =>
        new Promise((resolve, reject) => {
          try {
            const ws = new WebSocket(aiJobWebSocketUrl(job.job_id))
            ws.onmessage = ev => {
              const data = JSON.parse(String(ev.data)) as AiJobProgress
              set({
                activeJob: data,
                statusMessage:
                  data.message ||
                  `Tile ${data.tiles_done} / ${data.tiles_total} · ETA ${formatEta(data.eta_seconds)}`,
              })
              if (data.status === 'completed' && data.result_geojson) {
                ws.close()
                resolve(data.result_geojson as GeoJSON.FeatureCollection)
              } else if (data.status === 'failed') {
                ws.close()
                reject(new Error(data.error || 'Detection failed'))
              }
            }
            ws.onerror = () => {
              ws.close()
              reject(new Error('ws_error'))
            }
          } catch (err) {
            reject(err instanceof Error ? err : new Error('ws_error'))
          }
        })

      const fc = await waitWs().catch(() => pollJob())
      set({ statusMessage: `Completed — ${fc.features?.length ?? 0} features published.` })
      void get().loadJobHistory()
      return fc
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : 'Detection failed' })
      return null
    } finally {
      set({ busy: false })
    }
  },
}))
