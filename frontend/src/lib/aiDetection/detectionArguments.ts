import type { AiModelParameters } from './types'

export type DetectionArgumentField =
  | {
      key: keyof AiModelParameters
      label: string
      kind: 'number'
      min?: number
      max?: number
      step?: number
    }
  | {
      key: keyof AiModelParameters
      label: string
      kind: 'boolean'
    }

/** ArcGIS-style model inference arguments shown after a model definition is selected. */
export const DETECTION_ARGUMENT_FIELDS: DetectionArgumentField[] = [
  { key: 'padding', label: 'Padding', kind: 'number', min: 0, step: 1 },
  { key: 'threshold', label: 'Confidence Threshold', kind: 'number', min: 0, max: 1, step: 0.01 },
  { key: 'nms_overlap', label: 'NMS Overlap', kind: 'number', min: 0, max: 1, step: 0.01 },
  { key: 'batch_size', label: 'Batch Size', kind: 'number', min: 1, step: 1 },
  { key: 'exclude_pad_detections', label: 'Exclude Padding Detections', kind: 'boolean' },
  { key: 'test_time_augmentation', label: 'Test Time Augmentation', kind: 'boolean' },
]
