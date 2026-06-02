import fs from 'node:fs';

const file = new URL(
  '../src/pages/satellite/SatelliteIntelligenceMain.tsx',
  import.meta.url,
);
const lines = fs.readFileSync(file, 'utf8').split('\n');

const insert = [
  '              <div className="si-weather-toggle">',
  '                <button',
  '                  type="button"',
  '                  className={`si-weather-button ${mapWeatherOpen ? \'active\' : \'\'}`}',
  '                  onClick={() => {',
  '                    setMapWeatherOpen(open => {',
  '                      const next = !open;',
  '                      if (next) setMapWeatherMinimized(false);',
  '                      return next;',
  '                    });',
  '                  }}',
  '                  title="Weather visualization"',
  '                  aria-label="Weather visualization"',
  '                  aria-pressed={mapWeatherOpen}',
  '                >',
  '                  <img src="/icons/lux-theme-sun.svg" alt="" width={18} height={18} draggable={false} />',
  '                </button>',
  '              </div>',
];

const idx = lines.findIndex(l =>
  l.includes('si-map-floating-controls__right si-map-floating-controls__right--proc-stack'),
);
if (idx < 0) {
  console.error('marker not found');
  process.exit(1);
}
if (lines[idx - 1]?.includes('si-weather-toggle')) {
  console.log('already inserted');
  process.exit(0);
}
lines.splice(idx, 0, ...insert);
fs.writeFileSync(file, lines.join('\n'));
console.log('inserted at', idx);
