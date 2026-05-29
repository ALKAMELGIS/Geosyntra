import type { AiJobProgress, AiModelInfo, AiModelParameters } from './types'

const baseUrl = () =>
  String(import.meta.env.VITE_AI_DETECTION_API_URL || 'http://localhost:8095').replace(/\/$/, '')

/** Network-safe fetch — never throws on connection refused / offline service. */
async function aiFetch(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${baseUrl()}${path}`, init)
  } catch {
    return null
  }
}

export function isAiServiceOfflineError(err: unknown): boolean {
  return err instanceof Error && /offline|unavailable|failed to fetch/i.test(err.message)
}

export async function fetchAiHealth(): Promise<{ ok: boolean; gpu_available: boolean }> {
  const res = await aiFetch('/health')
  if (!res?.ok) throw new Error('AI Detection service offline')
  return res.json()
}

export async function listAiModels(): Promise<AiModelInfo[]> {
  const res = await aiFetch('/api/v1/ai/models')
  if (!res?.ok) return []
  try {
    return await res.json()
  } catch {
    return []
  }
}

async function parseModelApiError(res: Response): Promise<string> {
  try {
    const err = await res.json()
    if (typeof err?.detail === 'string') return err.detail
    return JSON.stringify(err.detail ?? err)
  } catch {
    return await res.text().catch(() => '')
  }
}

/** Normalize upload/import API body (direct ModelInfo or legacy `{ model }` wrapper). */
function normalizeModelResponse(data: unknown): AiModelInfo | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (o.model && typeof o.model === 'object') return o.model as AiModelInfo
  if (typeof o.id === 'string') return data as AiModelInfo
  return null
}

export async function uploadAiModel(file: File): Promise<AiModelInfo> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await aiFetch('/api/v1/ai/models/upload', { method: 'POST', body: fd })
  if (!res) throw new Error('AI Detection service is offline. Start docker compose -f docker-compose.ai.yml')
  if (!res.ok) {
    const detail = await parseModelApiError(res)
    throw new Error(detail || 'Model upload failed')
  }
  const model = normalizeModelResponse(await res.json())
  if (!model?.id) throw new Error('Invalid model response from server')
  return model
}

export async function importAiModelFromUrl(url: string): Promise<AiModelInfo> {
  const res = await aiFetch('/api/v1/ai/models/import-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  })
  if (!res) throw new Error('AI Detection service is offline. Start docker compose -f docker-compose.ai.yml')
  if (!res.ok) {
    const detail = await parseModelApiError(res)
    throw new Error(detail || 'Model import from URL failed')
  }
  const model = normalizeModelResponse(await res.json())
  if (!model?.id) throw new Error('Invalid model response from server')
  return model
}

export function formatAiModelSummary(model: AiModelInfo): string {
  const size =
    model.input_size?.width && model.input_size?.height
      ? `${model.input_size.width}×${model.input_size.height}`
      : '—'
  const classes =
    model.classes?.length ? `${model.classes.length} (${model.classes.slice(0, 3).join(', ')}${model.classes.length > 3 ? '…' : ''})` : '—'
  const gpu = model.gpu_required ? 'GPU recommended' : 'CPU OK'
  return `${model.name} · ${model.framework} · ${model.model_type} · ${size} · classes: ${classes} · ${gpu}`
}

export type CreateJobInput = {
  imagery_source: string
  imagery_type: 'wms' | 'upload' | 'layer'
  model_id: string | null
  aoi_geojson: GeoJSON.GeoJSON | null
  use_gpu: boolean
  gpu_device: string
  tile_size: number
  parallel_factor?: string
  mask_layer_id?: string
  cell_size_mode?: string
  cell_size_value?: string
  extent_source?: string
  params: AiModelParameters
}

export async function createAiDetectionJob(input: CreateJobInput): Promise<AiJobProgress> {
  const res = await aiFetch('/api/v1/ai/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res?.ok) {
    const detail = res ? await res.text().catch(() => '') : ''
    throw new Error(
      res
        ? `Failed to start detection job${detail ? `: ${detail.slice(0, 120)}` : ''}`
        : 'AI detection service is unavailable.',
    )
  }
  return res.json()
}

export async function getAiJob(jobId: string): Promise<AiJobProgress> {
  const res = await aiFetch(`/api/v1/ai/jobs/${jobId}`)
  if (!res?.ok) throw new Error('Job not found')
  return res.json()
}

export function aiJobWebSocketUrl(jobId: string): string {
  const http = baseUrl()
  const ws = http.replace(/^http/, 'ws')
  return `${ws}/ws/ai/jobs/${jobId}`
}

export async function listAiJobHistory(): Promise<AiJobProgress[]> {
  const res = await aiFetch('/api/v1/ai/jobs')
  if (!res?.ok) return []
  try {
    return await res.json()
  } catch {
    return []
  }
}
