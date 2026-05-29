import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = join(root, 'frontend/src/pages/satellite/SatelliteIntelligenceMain.tsx')
let text = readFileSync(p, 'utf8')
const startMarker = "                    {expandedEnvSection === 'ai-detection-gis' && ("
const endMarker = "                    {expandedEnvSection === 'source' && ("
const i = text.indexOf(startMarker)
const j = text.indexOf(endMarker)
if (i < 0 || j < 0 || j <= i) {
  console.error('markers not found', i, j)
  process.exit(1)
}
const replacement = `                    {expandedEnvSection === 'ai-detection-gis' && (
                      <SiAiDetectionPanel
                        onClose={() => setIsLayerDropdownOpen(false)}
                        imageryOptions={netfloraInputLayerOptions}
                        aoiGeoJson={netfloraAoiFeature}
                        onPublishLayer={({ id, name, geojson, threshold }) => {
                          setCustomLayers(prev => {
                            const nextLayer: CustomLayer = {
                              id,
                              name,
                              source: 'api',
                              sourceUrl: 'geosyntra://ai-detection',
                              authToken: null,
                              geojson: geojson as any,
                              visible: true,
                              color: '#22d3ee',
                              symbology: {
                                useArcGisOnline: false,
                                style: 'color',
                                field: 'confidence',
                                classes: 5,
                                method: 'quantile',
                                colorRamp: 'teal',
                                threshold,
                              },
                            }
                            const has = prev.some(l => l.id === id)
                            return has ? prev.map(l => (l.id === id ? { ...l, ...nextLayer } : l)) : [...prev, nextLayer]
                          })
                        }}
                      />
                    )}
`
writeFileSync(p, text.slice(0, i) + replacement + text.slice(j), 'utf8')
console.log('OK replaced', j - i, 'chars')
