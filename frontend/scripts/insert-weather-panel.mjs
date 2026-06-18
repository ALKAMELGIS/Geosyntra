import fs from 'node:fs';

const file = new URL(
  '../src/pages/satellite/SatelliteIntelligenceMain.tsx',
  import.meta.url,
);
let text = fs.readFileSync(file, 'utf8');

const panelBlock = `
          {isMapLoaded && mapWeatherOpen ? (
            <SiMapWeatherToolPanel
              open={mapWeatherOpen}
              minimized={mapWeatherMinimized}
              onMinimizedChange={setMapWeatherMinimized}
              onClose={() => {
                setMapWeatherOpen(false);
                setMapWeatherMinimized(false);
              }}
              settings={mapWeatherSettings}
              onSettingsChange={setMapWeatherSettings}
              readCamera={readMapWeatherCamera}
              basemapId={activeBasemapId}
              onApplySlide={applyMapWeatherSceneSlide}
            />
          ) : null}
`;

const overlayBlock = `
          <SiMapWeatherOverlay settings={mapWeatherSettings} active={isMapLoaded} />
`;

if (!text.includes('SiMapWeatherToolPanel')) {
  const anchor = '{isMapLoaded && routeMapOpen ? (';
  const pos = text.indexOf(anchor);
  if (pos < 0) {
    console.error('route map anchor not found');
    process.exit(1);
  }
  text = text.slice(0, pos) + panelBlock + '\n          ' + text.slice(pos);
}

if (!text.includes('SiMapWeatherOverlay')) {
  const anchor = '<SiMapElevationDock';
  const pos = text.indexOf(anchor);
  if (pos < 0) {
    console.error('elevation dock anchor not found');
    process.exit(1);
  }
  text = text.slice(0, pos) + overlayBlock + '\n          ' + text.slice(pos);
}

fs.writeFileSync(file, text);
console.log('panel and overlay inserted');
