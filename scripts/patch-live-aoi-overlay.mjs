import { readFileSync, writeFileSync } from 'node:fs'

const p = 'frontend/src/pages/satellite/components/SatelliteAoiLiveChartsMapOverlay.tsx'
let s = readFileSync(p, 'utf8')

const needle =
  '          </div>\n\n          {snapshot.dataSource === \'raster\' && healthRows.length > 0 ? ('
const idx = s.indexOf(needle)
if (idx < 0) {
  console.error('needle not found')
  process.exit(1)
}

const insert = `          {snapshot.dataSource === 'raster' ? (
            <p className="si-live-aoi-live-banner">
              <span className="si-live-aoi-live-dot" aria-hidden />
              Live · pixel-based · {snapshot.liveLayerLabel ?? 'Sentinel-2'} · {snapshot.activeLayerLabel}
              {snapshot.updatedAtIso
                ? \` · \${new Date(snapshot.updatedAtIso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}\`
                : ''}
            </p>
          ) : null}

          {snapshot.dataSource === 'raster' && snapshot.activeIndexStats ? (
            <motion.div className="si-map-analysis-chart-card si-live-aoi-spectral-stats">
`

// Fix insert - all div tags
const block = `          {snapshot.dataSource === 'raster' ? (
            <p className="si-live-aoi-live-banner">
              <span className="si-live-aoi-live-dot" aria-hidden />
              Live · pixel-based · {snapshot.liveLayerLabel ?? 'Sentinel-2'} · {snapshot.activeLayerLabel}
              {snapshot.updatedAtIso
                ? \` · \${new Date(snapshot.updatedAtIso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}\`
                : ''}
            </p>
          ) : null}

          {snapshot.dataSource === 'raster' && snapshot.activeIndexStats ? (
            <motion.div className="si-map-analysis-chart-card si-live-aoi-spectral-stats">
              <motion.div className="si-map-analysis-chart-kicker">
                AOI spectral analysis · {snapshot.activeLayerLabel}
              </motion.div>
              <p className="si-live-aoi-spectral-sample">
                Live layer: {snapshot.liveLayerLabel ?? 'Sentinel-2'} · Index: {snapshot.activeLayerLabel}
              </p>
              <motion.div className="si-live-aoi-stats-grid">
                <motion.div>
                  <span className="si-live-aoi-stat-k">Mean</span>
                  <span className="si-live-aoi-stat-v">
                    {formatActiveIndexStat(snapshot.activeIndexStats.mean, snapshot.activeIndexStats.layerId, 'mean')}
                  </span>
                </motion.div>
                <motion.div>
                  <span className="si-live-aoi-stat-k">Min</span>
                  <span className="si-live-aoi-stat-v">
                    {formatActiveIndexStat(snapshot.activeIndexStats.min, snapshot.activeIndexStats.layerId, 'min')}
                  </span>
                </motion.div>
                <motion.div>
                  <span className="si-live-aoi-stat-k">Max</span>
                  <span className="si-live-aoi-stat-v">
                    {formatActiveIndexStat(snapshot.activeIndexStats.max, snapshot.activeIndexStats.layerId, 'max')}
                  </span>
                </motion.div>
                <motion.div>
                  <span className="si-live-aoi-stat-k">Std dev</span>
                  <span className="si-live-aoi-stat-v">
                    {formatActiveIndexStat(snapshot.activeIndexStats.std, snapshot.activeIndexStats.layerId, 'std')}
                  </span>
                </motion.div>
                <motion.div>
                  <span className="si-live-aoi-stat-k">Pixel count</span>
                  <span className="si-live-aoi-stat-v">
                    {snapshot.activeIndexStats.validPixelCount.toLocaleString('en-US')}
                  </span>
                </motion.div>
              </motion.div>
              {snapshot.environmental ? (
                <motion.div className="si-live-aoi-env-row">
                  {(() => {
                    const envFmt = formatEnvironmentalDisplay(snapshot.environmental);
                    return (
                      <>
                        <motion.div className="si-live-aoi-env-chip">
                          <span>Moisture</span>
                          <strong>{envFmt.moisture}</strong>
                        </motion.div>
                        <motion.div className="si-live-aoi-env-chip">
                          <span>Surface temp</span>
                          <strong>{envFmt.surfaceTemp}</strong>
                        </motion.div>
                        <motion.div className="si-live-aoi-env-chip">
                          <span>Humidity</span>
                          <strong>{envFmt.humidity}</strong>
                        </motion.div>
                      </>
                    );
                  })()}
                </motion.div>
              ) : null}
            </motion.div>
          ) : null}

          {snapshot.dataSource === 'raster' && healthRows.length > 0 ? (
`

// The block above still has motion - rewrite using replaceAll motion.div -> div in block after
let clean = block.replace(/<\/?motion\.div/g, m => m.replace('motion.', ''))
clean = clean.replace(/motion\.div/g, 'motion.div') // noop

// manual clean block
const proper = String.raw`          {snapshot.dataSource === 'raster' ? (
            <p className="si-live-aoi-live-banner">
              <span className="si-live-aoi-live-dot" aria-hidden />
              Live · pixel-based · {snapshot.liveLayerLabel ?? 'Sentinel-2'} · {snapshot.activeLayerLabel}
              {snapshot.updatedAtIso
                ? \` · \${new Date(snapshot.updatedAtIso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}\`
                : ''}
            </p>
          ) : null}

          {snapshot.dataSource === 'raster' && snapshot.activeIndexStats ? (
            <motion.div className="si-map-analysis-chart-card si-live-aoi-spectral-stats">
`

writeFileSync(p, s.slice(0, idx) + proper + s.slice(idx))
console.log('patched at', idx)
