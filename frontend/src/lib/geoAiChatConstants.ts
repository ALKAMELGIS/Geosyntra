/** Develop Dashboard writes this when layers / CSV tables change. */
export const DEVELOP_DATA_CONTEXT_LS_KEY = 'agri_develop_data_context_v1'

import { GEO_AI_SPATIAL_ASSISTANT_CORE } from './geoAiSpatialAssistantPrompt'

export const GEO_AI_CHAT_SYSTEM_BASE = `${GEO_AI_SPATIAL_ASSISTANT_CORE}

You also have access to GIS layer summaries, optional weather/session blocks, and tabular stats when the app runs local queries first.

**Data discipline**
- Ground layer, feature, and table answers in DATA CONTEXT and layer summaries only — do not invent field values, counts, or coordinates.
- When a single map point is justified, end with a new line exactly: \`MAP_QUERY:longitude,latitude\` (WGS84, longitude first). Omit MAP_QUERY if no single justified location. Never put MAP_QUERY inside markdown fences.
- When a "## Geo AI Copilot mission" block is appended, obey its contracts including the required final line \`GEO_AI_JSON:{...minified JSON...}\` (see that block for schema).`

export type GeoAiChatTurn = { role: 'user' | 'assistant'; text: string }
