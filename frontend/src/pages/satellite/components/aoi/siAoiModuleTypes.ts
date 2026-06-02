/** Map interaction — mutually exclusive modes (no draw + pan + move at once). */
export type SiMapInteractionMode = 'view' | 'draw' | 'move'

/** Shape tools available only in `draw` mode. */
export type AoiDrawShapeTool = 'rectangle' | 'polygon' | 'circle' | 'freehand'

/** AOI module draw tools — independent from Fields Data sketch mode. */
export type MapDrawTool = 'select' | 'move' | 'polygon' | 'rectangle' | 'circle' | 'freehand'

/** Sub-tools available only when Edit AOI mode is enabled. */
export type AoiGeometryEditSubTool =
  | 'vertex'
  | 'addVertex'
  | 'removeVertex'
  | 'reshape'
  | 'rotate'
  | 'scale'

export type SiAoiWorkspaceRow = {
  id: string
  name: string
  color: string
  source: 'drawn' | 'upload' | 'layer'
  /** Show AOI outline on the map (opt-in; default hidden). */
  mapVisible?: boolean
  /** @deprecated Use `mapVisible` */
  visible?: boolean
}

export type SiAoiDrawnStats = {
  mean: number
  min: number
  max: number
  std: number
}
