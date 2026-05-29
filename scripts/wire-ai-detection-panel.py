from pathlib import Path

p = Path(__file__).resolve().parents[1] / "frontend/src/pages/satellite/SatelliteIntelligenceMain.tsx"
text = p.read_text(encoding="utf-8")
start_marker = "                    {expandedEnvSection === 'ai-detection-gis' && ("
end_marker = "                    {expandedEnvSection === 'source' && ("
i = text.find(start_marker)
j = text.find(end_marker)
if i < 0 or j < 0 or j <= i:
    raise SystemExit(f"markers not found i={i} j={j}")

replacement = """                    {expandedEnvSection === 'ai-detection-gis' && (
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
"""
new_text = text[:i] + replacement + text[j:]
p.write_text(new_text, encoding="utf-8", newline="\n")
print("OK replaced", j - i, "chars")
