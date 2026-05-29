export type AiModelFormat = 'dlpk' | 'onnx' | 'pytorch' | 'unknown'

export type AiDetectionJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type AiModelParameters = {
  threshold: number
  nms_overlap: number
  padding: number
  batch_size: number
  test_time_augmentation: boolean
  exclude_pad_detections: boolean
}

export type AiModelInputSize = {
  width: number
  height: number
}

export type AiModelPipelineStage =
  | 'idle'
  | 'uploading'
  | 'validating'
  | 'parsing'
  | 'registering'
  | 'ready'
  | 'error'

export type AiModelInfo = {
  id: string
  name: string
  framework: string
  model_type: string
  file_name: string
  created_at: string
  kind?: AiModelFormat
  classes?: string[]
  input_size?: AiModelInputSize | null
  gpu_required?: boolean
  validated?: boolean
  validation_errors?: string[]
  source_url?: string | null
}

export type AiJobProgress = {
  job_id: string
  status: AiDetectionJobStatus
  progress: number
  tiles_done: number
  tiles_total: number
  gpu_usage_pct: number | null
  eta_seconds: number | null
  message: string
  result_geojson?: GeoJSON.FeatureCollection | null
  error?: string | null
}

export type ImageryInputKind =
  | 'basemap'
  | 'live_wms'
  | 'raster_dataset'
  | 'raster_layer'
  | 'mosaic_layer'
  | 'image_service'
  | 'map_server'
  | 'map_server_layer'
  | 'internet_tiled'
  | 'upload'

export type ImageryInputGroup = 'live' | 'raster' | 'services'

export type ImageryOption = {
  id: string
  label: string
  kind: ImageryInputKind
  group: ImageryInputGroup
}

/** ArcGIS Deep Learning — default detection arguments when a model is selected. */
export const DEFAULT_AI_PARAMS: AiModelParameters = {
  threshold: 0.1,
  nms_overlap: 0.1,
  padding: 100,
  batch_size: 4,
  test_time_augmentation: false,
  exclude_pad_detections: true,
}
