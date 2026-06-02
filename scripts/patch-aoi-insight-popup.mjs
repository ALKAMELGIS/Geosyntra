import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'frontend/src/pages/satellite/SatelliteIntelligenceMain.tsx');
let s = fs.readFileSync(file, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const old = [
  '                const areaHa =',
  '                  zonal?.areaHa ?? rasterSample?.areaHa ?? (g ? geodesicAreaHectares(g) : 0);',
  '                return (',
].join(nl);

const neu = [
  '                const areaHa =',
  '                  zonal?.areaHa ?? rasterSample?.areaHa ?? (g ? geodesicAreaHectares(g) : 0);',
  '                const useDrawnTimeline =',
  '                  row.source === \'drawn\' ||',
  '                  row.id === activeMultiAoiId ||',
  '                  (drawnGeometry && row.feature === drawnGeometry);',
  '                const timelineFallback =',
  '                  !rasterSample && useDrawnTimeline && drawnStats',
  '                    ? { mean: drawnStats.mean, min: drawnStats.min, max: drawnStats.max }',
  '                    : null;',
  '                return (',
].join(nl);

if (s.includes('timelineFallback') && s.includes('SiAoiMapInsightPopup')) {
  console.log('already patched vars');
} else if (s.includes(old)) {
  s = s.replace(old, neu);
}

const blockOld = [
  '                      className="si-multi-aoi-popup si-multi-aoi-popup--live"',
  '                      onClick={e => e.stopPropagation()}',
  '                      onPointerDown={e => e.stopPropagation()}',
  '                      initial={{ opacity: 0, y: 8, scale: 0.98 }}',
  '                      animate={{ opacity: 1, y: 0, scale: 1 }}',
  '                      transition={{ type: \'spring\', stiffness: 420, damping: 32 }}',
  '                    >',
  '                      <div className="si-multi-aoi-popup__head">',
  '                        <strong className="si-multi-aoi-popup__title">{row.name}</strong>',
  '                        <button',
  '                          type="button"',
  '                          className="si-multi-aoi-popup__close"',
  '                          onClick={() => setMultiAoiPopupIds(prev => prev.filter(x => x !== pid))}',
  '                          aria-label="Close AOI popup"',
  '                        >',
  '                          <i className="fa-solid fa-xmark" aria-hidden />',
  '                        </button>',
  '                      </div>',
  '                      <div',
  '                        className="si-multi-aoi-popup__scroll"',
  '                        tabIndex={0}',
  '                        aria-label="AOI analysis details"',
  '                        onWheel={e => e.stopPropagation()}',
  '                      >',
  '                        <SiAoiLiveAnalysisPopup',
  '                          analytics={zonal ?? null}',
  '                          indexHealth={indexHealth}',
  '                          rasterSample={rasterSample}',
  '                          feature={row.feature}',
  '                          activeLayerId={activeLayerId}',
  '                          status={fetchStatus}',
  '                          error={',
  '                            fetchStatus === \'error\' && !zonal',
  '                              ? \'Could not sample Sentinel-2 pixels for this AOI. Showing timeline week values when available.\'',
  '                              : null',
  '                          }',
  '                          highlightLayerIds={popupZonalLayerIds}',
  '                          areaDisplay={<SiAoiAreaHaSqm ha={areaHa} />}',
  '                        />',
  '                      </div>',
  '                    </motion.div>',
].join(nl);

const blockNew = [
  '                      className="si-multi-aoi-popup si-multi-aoi-popup--live si-multi-aoi-popup--insight"',
  '                      onClick={e => e.stopPropagation()}',
  '                      onPointerDown={e => e.stopPropagation()}',
  '                      initial={{ opacity: 0, y: 8, scale: 0.98 }}',
  '                      animate={{ opacity: 1, y: 0, scale: 1 }}',
  '                      transition={{ type: \'spring\', stiffness: 420, damping: 32 }}',
  '                    >',
  '                      <div className="si-multi-aoi-popup__head">',
  '                        <strong className="si-multi-aoi-popup__title">{row.name}</strong>',
  '                        <button',
  '                          type="button"',
  '                          className="si-multi-aoi-popup__close"',
  '                          onClick={() => setMultiAoiPopupIds(prev => prev.filter(x => x !== pid))}',
  '                          aria-label="Close AOI popup"',
  '                        >',
  '                          <i className="fa-solid fa-xmark" aria-hidden />',
  '                        </button>',
  '                      </div>',
  '                      <SiAoiMapInsightPopup',
  '                        areaHa={areaHa}',
  '                        centroid={[c[0], c[1]]}',
  '                        activeLayerId={activeLayerId}',
  '                        analytics={zonal ?? null}',
  '                        rasterSample={rasterSample}',
  '                        feature={row.feature}',
  '                        status={fetchStatus}',
  '                        mapboxToken={mapboxToken}',
  '                        timelineFallback={timelineFallback}',
  '                        highlightLayerIds={popupZonalLayerIds}',
  '                      />',
  '                    </motion.div>',
].join(nl);

// fix accidental motion.div in script output
const fixedNew = blockNew.replaceAll('motion.div', 'div');
const fixedOld = blockOld.replaceAll('motion.div', 'motion.div');

if (s.includes('SiAoiMapInsightPopup')) {
  console.log('insight component already wired');
} else if (s.includes(blockOld)) {
  s = s.replace(blockOld, fixedNew);
} else {
  console.error('block not found');
  process.exit(1);
}

if (!s.includes('SiAoiMapInsightPopup')) {
  const imp = "import { SiAoiMapInsightPopup } from './components/SiAoiMapInsightPopup';";
  if (!s.includes(imp)) {
    s = s.replace(
      "import { SiAoiLiveAnalysisPopup } from './components/SiAoiLiveAnalysisPopup';",
      "import { SiAoiLiveAnalysisPopup } from './components/SiAoiLiveAnalysisPopup';\r\nimport { SiAoiMapInsightPopup } from './components/SiAoiMapInsightPopup';".replace(
        /\r\n/g,
        nl,
      ),
    );
  }
}

fs.writeFileSync(file, s, 'utf8');
console.log('ok');
