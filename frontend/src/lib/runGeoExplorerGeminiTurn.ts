/**
 * Shared Gemini Geo Explorer / Geo AI turn: same system context, weather, layer lookup, and MAP_QUERY
 * logic for Satellite Imagery and GIS Map.
 */

import { buildGisContentLayersContext } from './geoAiChatClaude'
import { buildGeoAiWeatherSystemAppend, type GeoAiWeatherPopupRef } from './geoAiWeatherContext'
import { geocodePlaceToLngLat, simplifyGeoExplorerUserQuery, stripLayerReferenceForGeocode } from './geoExplorerGeocode'
import {
  GEO_EXPLORER_LAYER_RULES,
  GEO_EXPLORER_SESSION_AND_WEATHER,
  GEO_EXPLORER_SYSTEM_PROMPT,
  geminiGenerateContent,
  messagesToGeminiContents,
  parseMapQueryLngLat,
  type GeoExplorerMessage,
} from './geoExplorerGemini'
import { findLngLatFromLayerQuery, summarizeGeoAiMapLayers, type GeoAiMapLayer, type LayerQueryMatch } from './geoExplorerLayerContext'
import { loadGisMapSavedLayers } from './gisMapLayerStore'

export type GeoExplorerGeminiPinSource = 'map_query' | 'layer' | 'geocode'

export type GeoExplorerGeminiMapEffect = {
  coords: [number, number]
  pinSource: GeoExplorerGeminiPinSource
  layerHit: LayerQueryMatch | null
  replyText: string
}

export type RunGeoExplorerGeminiTurnResult = {
  modelMsg: GeoExplorerMessage
  mapEffect: GeoExplorerGeminiMapEffect | null
}

export type RunGeoExplorerGeminiTurnParams = {
  apiKey: string
  historyWithUser: GeoExplorerMessage[]
  userTextForMapFallback: string
  /** Vector layers for this surface (Satellite “added” layers or GIS map layers). */
  primaryVectorLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
  openWeatherApiKey: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  mapPopup: GeoAiWeatherPopupRef
  /** First line of the added-layers section, e.g. "### Satellite — Added layers (this page)" */
  addedLayersHeading: string
}

export async function runGeoExplorerGeminiTurn(
  params: RunGeoExplorerGeminiTurnParams,
): Promise<RunGeoExplorerGeminiTurnResult> {
  const {
    apiKey,
    historyWithUser,
    userTextForMapFallback,
    primaryVectorLayers,
    mapboxAccessToken,
    openWeatherApiKey,
    pinLngLat,
    lastMapQueryCoords,
    mapPopup,
    addedLayersHeading,
  } = params

  const gisSaved = await loadGisMapSavedLayers()
  const combinedForLookup: GeoAiMapLayer[] = [
    ...primaryVectorLayers,
    ...gisSaved.map(
      (l): GeoAiMapLayer => ({
        name: l.name,
        visible: l.visible,
        source: l.source,
        data: l.data,
        arcgisLayerDefinition: (l as { arcgisLayerDefinition?: unknown }).arcgisLayerDefinition as
          | GeoAiMapLayer['arcgisLayerDefinition']
          | undefined,
      }),
    ),
  ]

  const gisBlock = await buildGisContentLayersContext(22000)
  const addedBlock = summarizeGeoAiMapLayers(primaryVectorLayers, 20000)

  let sessionWeatherBlocks = `\n\n${GEO_EXPLORER_SESSION_AND_WEATHER}`
  sessionWeatherBlocks += await buildGeoAiWeatherSystemAppend({
    userText: userTextForMapFallback,
    pinLngLat,
    lastMapQueryCoords,
    combinedLayers: combinedForLookup,
    mapboxAccessToken,
    openWeatherApiKey,
    mapPopup,
  })

  const systemInstruction = `${GEO_EXPLORER_SYSTEM_PROMPT}\n\n${GEO_EXPLORER_LAYER_RULES}${sessionWeatherBlocks}\n\n---\n${addedLayersHeading}\n${addedBlock}\n\n${gisBlock}`

  const reply = await geminiGenerateContent({
    apiKey,
    systemInstruction,
    contents: messagesToGeminiContents(historyWithUser),
  })

  const mapQueryCoords = parseMapQueryLngLat(reply)
  let coords: [number, number] | null = mapQueryCoords
  let replyText = reply
  let layerHit: LayerQueryMatch | null = null
  let pinSource: GeoExplorerGeminiPinSource = mapQueryCoords ? 'map_query' : 'geocode'

  if (!coords && userTextForMapFallback) {
    layerHit = findLngLatFromLayerQuery(userTextForMapFallback, combinedForLookup)
    if (layerHit) {
      coords = [layerHit.lng, layerHit.lat]
      pinSource = 'layer'
      const hint = layerHit.matchSummary.trim()
      replyText = `${reply.trimEnd()}\n\n(Map pin from layer "${layerHit.layerName}" — matched feature attributes: ${hint.slice(0, 200)}${hint.length > 200 ? '…' : ''})`
    } else {
      const geoQuery = stripLayerReferenceForGeocode(simplifyGeoExplorerUserQuery(userTextForMapFallback))
      if (geoQuery.length >= 2) {
        const geocoded = await geocodePlaceToLngLat(geoQuery, {
          mapboxAccessToken,
        })
        if (geocoded) {
          coords = geocoded
          pinSource = 'geocode'
          replyText = `${reply.trimEnd()}\n\n(Map centered on the best place-name match for your message.)`
        }
      }
    }
  }

  if (coords && !parseMapQueryLngLat(replyText)) {
    replyText = `${replyText.trimEnd()}\nMAP_QUERY:${coords[0]},${coords[1]}`
  }

  const modelId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-m-${Date.now()}`
  const modelMsg: GeoExplorerMessage = {
    id: modelId,
    role: 'model',
    parts: [{ type: 'text', text: replyText }],
  }

  if (!coords) {
    return { modelMsg, mapEffect: null }
  }

  return {
    modelMsg,
    mapEffect: {
      coords,
      pinSource,
      layerHit,
      replyText,
    },
  }
}

export function geoExplorerTargetZoomForPinSource(pinSource: GeoExplorerGeminiPinSource): number {
  if (pinSource === 'layer') return 17
  if (pinSource === 'map_query') return 15.75
  return 13.65
}
