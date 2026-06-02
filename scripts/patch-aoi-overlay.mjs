import fs from 'node:fs';
import path from 'node:path';

const file = path.join(
  process.cwd(),
  'frontend/src/pages/satellite/components/SatelliteAoiLiveChartsMapOverlay.tsx',
);
let s = fs.readFileSync(file, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const X = 'div';

const oldMean = [
  `              <${X} className="si-live-aoi-metric-v si-live-aoi-metric-v--index">`,
  `                {formatLivePrimaryIndex(snapshot.primaryIndexValue, snapshot.activeLayerId)}`,
  `              </${X}>`,
].join(nl);

const newMean = [
  `              <${X} className="si-live-aoi-metric-v si-live-aoi-metric-v--index">`,
  `                {snapshot.activeIndexStats`,
  `                  ? formatActiveIndexStat(`,
  `                      snapshot.activeIndexStats.mean,`,
  `                      snapshot.activeIndexStats.layerId,`,
  `                      'mean',`,
  `                    )`,
  `                  : formatLivePrimaryIndex(snapshot.primaryIndexValue, snapshot.activeLayerId)}`,
  `              </${X}>`,
].join(nl);

if (!s.includes(oldMean)) {
  console.error('mean block not found');
  process.exit(1);
}
s = s.replace(oldMean, newMean);

const anchor = [`          </${X}>`, '', `          {snapshot.dataSource === 'raster' && healthRows.length > 0 ? (`].join(
  nl,
);
const withCard = [
  `          </${X}>`,
  '',
  `          <SiLiveAoiSpectralStatsCard snapshot={snapshot} />`,
  '',
  `          {snapshot.dataSource === 'raster' && healthRows.length > 0 ? (`,
].join(nl);

if (!s.includes('<SiLiveAoiSpectralStatsCard')) {
  if (!s.includes(anchor)) {
    console.error('anchor not found');
    process.exit(1);
  }
  s = s.replace(anchor, withCard);
}

fs.writeFileSync(file, s, 'utf8');
console.log('ok');
