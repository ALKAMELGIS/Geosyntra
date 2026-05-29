/**
 * Geo Explor AI Agent — Grounding Lite MCP-style tool router (server-side).
 * Keeps Google Maps Platform keys off the browser; exposes structured tools to the SPA.
 *
 * Inspired by https://github.com/googlemaps-samples/grounding-lite-mcp-sample-app (Apache-2.0).
 */

import {
  computeRoute,
  geocodeAddress,
  placesTextSearch,
  resolveGoogleMapsServerApiKey,
  sampleElevation,
} from './geoGrounding/googleMapsPlatform.js'
import { graphHopperDirections, resolveGraphHopperKey } from './geoGrounding/graphHopper.js'
import { orsDirections, resolveOpenRouteServiceKey } from './geoGrounding/openRouteService.js'

const TOOL_IDS = ['geocode', 'places_text_search', 'compute_route', 'elevation']

async function resolveKey(getSystemToken, tokenName, legacyResolver, secretsFilePath) {
  if (getSystemToken) {
    const v = await getSystemToken(tokenName)
    if (v) return v
  }
  return legacyResolver(secretsFilePath)
}

export function registerGeoGroundingRoutes(app, { secretsFilePath, getSystemToken, invokeMiddleware = [] } = {}) {
  app.get('/api/geo/grounding/status', async (_req, res) => {
    const apiKey = await resolveKey(getSystemToken, 'google_maps', resolveGoogleMapsServerApiKey, secretsFilePath)
    const orsKey = await resolveKey(getSystemToken, 'openrouteservice', resolveOpenRouteServiceKey, secretsFilePath)
    const ghKey = await resolveKey(getSystemToken, 'graphhopper', resolveGraphHopperKey, secretsFilePath)
    res.json({
      ok: true,
      configured: Boolean(apiKey || orsKey || ghKey),
      tools: TOOL_IDS,
      providers: {
        google_maps_platform: Boolean(apiKey),
        openrouteservice: Boolean(orsKey),
        graphhopper: Boolean(ghKey),
      },
    })
  })

  app.post('/api/geo/grounding/invoke', ...invokeMiddleware, async (req, res) => {
    const apiKey = await resolveKey(getSystemToken, 'google_maps', resolveGoogleMapsServerApiKey, secretsFilePath)
    const orsKey = await resolveKey(getSystemToken, 'openrouteservice', resolveOpenRouteServiceKey, secretsFilePath)
    const ghKey = await resolveKey(getSystemToken, 'graphhopper', resolveGraphHopperKey, secretsFilePath)

    const tool = String(req.body?.tool || '').trim()
    if (!TOOL_IDS.includes(tool)) {
      return res.status(400).json({ ok: false, error: 'unknown_tool', tool, allowed: TOOL_IDS })
    }

    if (!apiKey && !orsKey && !ghKey && tool !== 'compute_route') {
      return res.status(503).json({
        ok: false,
        error: 'geo_grounding_not_configured',
        detail:
          'Set GOOGLE_MAPS_SERVER_API_KEY, GRAPHHOPPER_API_KEY, and/or OPENROUTESERVICE_API_KEY on the API host.',
      })
    }

    try {
      if (tool === 'geocode') {
        if (!apiKey) {
          return res.status(503).json({ ok: false, error: 'google_maps_not_configured' })
        }
        const address = String(req.body?.address || '').trim()
        if (!address) return res.status(400).json({ ok: false, error: 'address_required' })
        const results = await geocodeAddress(apiKey, {
          address,
          language: req.body?.language || 'en',
        })
        return res.json({ ok: true, tool, results })
      }

      if (tool === 'places_text_search') {
        if (!apiKey) {
          return res.status(503).json({ ok: false, error: 'google_maps_not_configured' })
        }
        const textQuery = String(req.body?.textQuery || req.body?.query || '').trim()
        if (!textQuery) return res.status(400).json({ ok: false, error: 'textQuery_required' })
        const bias = req.body?.locationBias
        const results = await placesTextSearch(apiKey, {
          textQuery,
          language: req.body?.language || 'en',
          maxResults: req.body?.maxResults,
          locationBias:
            bias && typeof bias.lat === 'number' && typeof bias.lng === 'number'
              ? { lat: bias.lat, lng: bias.lng, radiusMeters: bias.radiusMeters }
              : undefined,
        })
        return res.json({ ok: true, tool, results })
      }

      if (tool === 'compute_route') {
        const origin = req.body?.origin
        const destination = req.body?.destination
        if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
          return res.status(400).json({ ok: false, error: 'origin_destination_required' })
        }
        const travelMode = req.body?.travelMode || 'DRIVE'
        const wantAlternatives = Math.min(3, Math.max(1, Number(req.body?.alternatives) || 2))

        if (orsKey) {
          try {
            const ors = await orsDirections(orsKey, {
              origin,
              destination,
              travelMode,
              alternatives: wantAlternatives,
            })
            if (ors?.routes?.length) {
              return res.json({
                ok: true,
                tool,
                routes: ors.routes,
                route: ors.routes[0],
                provider: 'openrouteservice',
                profile: ors.profile,
              })
            }
          } catch (e) {
            console.warn('[geo-grounding] OpenRouteService route failed:', e?.message || e)
            if (!ghKey && !apiKey) throw e
          }
        }

        if (ghKey) {
          try {
            const gh = await graphHopperDirections(ghKey, {
              origin,
              destination,
              travelMode,
              alternatives: wantAlternatives,
            })
            if (gh?.routes?.length) {
              return res.json({
                ok: true,
                tool,
                routes: gh.routes,
                route: gh.routes[0],
                provider: 'graphhopper',
                profile: gh.profile,
              })
            }
          } catch (e) {
            console.warn('[geo-grounding] GraphHopper route failed:', e?.message || e)
            if (!apiKey) throw e
          }
        }

        if (apiKey) {
          try {
            const route = await computeRoute(apiKey, { origin, destination, travelMode })
            if (route?.polyline) {
              return res.json({ ok: true, tool, route, provider: 'google_maps_platform' })
            }
          } catch (e) {
            if (!orsKey && !ghKey) throw e
            console.warn('[geo-grounding] Google route failed:', e?.message || e)
          }
        }

        return res.status(503).json({
          ok: false,
          error: 'routing_not_configured',
          detail:
            'Set GRAPHHOPPER_API_KEY, GOOGLE_MAPS_SERVER_API_KEY, or OPENROUTESERVICE_API_KEY for route analysis.',
        })
      }

      if (tool === 'elevation') {
        if (!apiKey) {
          return res.status(503).json({ ok: false, error: 'google_maps_not_configured' })
        }
        const locations = Array.isArray(req.body?.locations) ? req.body.locations : []
        if (!locations.length) return res.status(400).json({ ok: false, error: 'locations_required' })
        const results = await sampleElevation(apiKey, { locations })
        return res.json({ ok: true, tool, results })
      }

      return res.status(400).json({ ok: false, error: 'unhandled_tool' })
    } catch (e) {
      console.error('[geo-grounding]', tool, e)
      res.status(502).json({
        ok: false,
        error: 'grounding_tool_failed',
        tool,
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  })
}
