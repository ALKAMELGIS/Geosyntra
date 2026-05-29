import fs from 'node:fs';
import path from 'node:path';

const target = path.join(
  process.cwd(),
  'frontend/src/pages/satellite/components/SiLiveAoiSpectralStatsCard.tsx',
);

const D = 'div';

const content = `import type { LiveAoiMapChartSnapshot } from '../utils/liveAoiMapChartSnapshot';
import {
  formatActiveIndexStat,
  formatEnvironmentalDisplay,
} from '../utils/liveAoiEnvironmentalIndicators';

export function SiLiveAoiSpectralStatsCard({ snapshot }: { snapshot: LiveAoiMapChartSnapshot }) {
  if (snapshot.dataSource !== 'raster' || !snapshot.activeIndexStats) return null;

  const st = snapshot.activeIndexStats;
  const envFmt = snapshot.environmental ? formatEnvironmentalDisplay(snapshot.environmental) : null;

  return (
    <${D} className="si-map-analysis-chart-card si-live-aoi-spectral-stats">
      <p className="si-live-aoi-live-banner">
        <span className="si-live-aoi-live-dot" aria-hidden />
        Live · pixel-based · {snapshot.liveLayerLabel ?? 'Sentinel-2'} · {snapshot.activeLayerLabel}
        {snapshot.updatedAtIso
          ? \` · Updated \${new Date(snapshot.updatedAtIso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}\`
          : ''}
      </p>
      <${D} className="si-map-analysis-chart-kicker">AOI spectral analysis · {snapshot.activeLayerLabel}</${D}>
      <p className="si-live-aoi-spectral-sample">
        Live layer: {snapshot.liveLayerLabel ?? 'Sentinel-2'} · Index: {snapshot.activeLayerLabel}
      </p>
      <${D} className="si-live-aoi-stats-grid">
        <${D}>
          <span className="si-live-aoi-stat-k">Mean</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.mean, st.layerId, 'mean')}</span>
        </${D}>
        <${D}>
          <span className="si-live-aoi-stat-k">Min</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.min, st.layerId, 'min')}</span>
        </${D}>
        <${D}>
          <span className="si-live-aoi-stat-k">Max</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.max, st.layerId, 'max')}</span>
        </${D}>
        <${D}>
          <span className="si-live-aoi-stat-k">Std dev</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.std, st.layerId, 'std')}</span>
        </${D}>
        <${D}>
          <span className="si-live-aoi-stat-k">Pixel count</span>
          <span className="si-live-aoi-stat-v">{st.validPixelCount.toLocaleString('en-US')}</span>
        </${D}>
      </${D}>
      {envFmt ? (
        <${D} className="si-live-aoi-env-row">
          <${D} className="si-live-aoi-env-chip">
            <span>Moisture</span>
            <strong>{envFmt.moisture}</strong>
          </${D}>
          <${D} className="si-live-aoi-env-chip">
            <span>Surface temp</span>
            <strong>{envFmt.surfaceTemp}</strong>
          </${D}>
          <${D} className="si-live-aoi-env-chip">
            <span>Humidity</span>
            <strong>{envFmt.humidity}</strong>
          </${D}>
        </${D}>
      ) : null}
    </${D}>
  );
}
`;

fs.writeFileSync(target, content, 'utf8');
console.log('wrote', target);
