import fs from 'node:fs';

const file = new URL(
  '../src/pages/satellite/components/SiMapWeatherToolPanel.tsx',
  import.meta.url,
);
const lines = fs.readFileSync(file, 'utf8').split('\n');

lines[234] = '            </motion.div>'.replace('motion.', '');
lines[234] = '            </motion.div>';
lines[234] = '            </motion.div>';

// line 235 (index 235): head-actions container — plain div
lines[235] = '            <motion.div className="si-weather-panel__head-actions">';
lines[235] = '            <motion.div className="si-weather-panel__head-actions">';
