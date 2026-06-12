/** ArcGIS Online Map Viewer — style card preview SVGs (matches AGOL picker thumbnails). */

import dotDensityThumbUrl from './assets/dot-density-thumb.svg';
import extrusion3dThumbUrl from './assets/extrusion-3d-thumb.svg';
import heatSurfaceThumbUrl from './assets/heat-surface-thumb.svg';
import pieChartThumbUrl from './assets/pie-chart-thumb.svg';

function svgDataUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}")`;
}

const MAP_BG = '#e8e8e8';

export const SI_SYM_AGOL_THUMB_BG: Record<string, string | undefined> = {
  unique: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <path fill="#b5d334" d="M0 0 L98 0 L88 58 L0 68 Z"/>
      <path fill="#e8788a" d="M98 0 L215 0 L205 60 L88 58 Z"/>
      <path fill="#6eb5e8" d="M215 0 L345 0 L355 52 L205 60 Z"/>
      <path fill="#a78bc4" d="M345 0 L400 0 L400 54 L355 52 Z"/>
      <path fill="#6eb5e8" d="M0 68 L88 58 L205 60 L195 112 L78 122 L0 150 Z"/>
      <path fill="#e8788a" d="M205 60 L355 52 L400 54 L400 108 L258 118 L195 112 Z"/>
      <path fill="#b5d334" d="M0 150 L78 122 L195 112 L248 150 Z"/>
      <path fill="#a78bc4" d="M195 112 L258 118 L400 108 L400 150 L248 150 Z"/>
    </svg>
  `),
  color: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <path fill="#0d4f5c" d="M18 32 L118 18 L138 82 L38 102 Z"/>
      <path fill="#1a7a8c" d="M98 34 L198 22 L218 86 L118 106 Z"/>
      <path fill="#3eb3c4" d="M178 38 L278 26 L298 90 L198 110 Z"/>
      <path fill="#9dd9e5" d="M258 42 L358 30 L372 94 L272 114 Z"/>
    </svg>
  `),
  class_breaks: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <g stroke="#d0d0d0" stroke-width="1.5">
        <line x1="0" y1="38" x2="400" y2="38"/><line x1="0" y1="75" x2="400" y2="75"/><line x1="0" y1="112" x2="400" y2="112"/>
        <line x1="52" y1="0" x2="52" y2="150"/><line x1="128" y1="0" x2="128" y2="150"/><line x1="204" y1="0" x2="204" y2="150"/>
        <line x1="280" y1="0" x2="280" y2="150"/><line x1="356" y1="0" x2="356" y2="150"/>
        <line x1="52" y1="38" x2="128" y2="75"/><line x1="204" y1="38" x2="280" y2="75"/><line x1="280" y1="75" x2="356" y2="112"/>
      </g>
      <circle cx="68" cy="52" r="5" fill="#f28b2c"/>
      <circle cx="142" cy="88" r="8" fill="#f28b2c"/>
      <circle cx="178" cy="48" r="11" fill="#f28b2c"/>
      <circle cx="238" cy="96" r="6" fill="#f28b2c"/>
      <circle cx="312" cy="44" r="14" fill="#f28b2c"/>
      <circle cx="348" cy="78" r="9" fill="#f28b2c"/>
      <circle cx="92" cy="118" r="7" fill="#f28b2c"/>
      <circle cx="262" cy="58" r="4" fill="#f28b2c"/>
      <circle cx="328" cy="122" r="12" fill="#f28b2c"/>
      <circle cx="38" cy="98" r="6" fill="#f28b2c"/>
    </svg>
  `),
  choropleth: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="#f4f4f4"/>
      <g stroke="#e2e2e2" stroke-width="1" fill="none">
        <line x1="0" y1="42" x2="400" y2="42"/><line x1="0" y1="78" x2="400" y2="78"/><line x1="0" y1="114" x2="400" y2="114"/>
        <line x1="48" y1="0" x2="48" y2="150"/><line x1="118" y1="0" x2="118" y2="150"/><line x1="188" y1="0" x2="188" y2="150"/>
        <line x1="258" y1="0" x2="258" y2="150"/><line x1="328" y1="0" x2="328" y2="150"/>
        <line x1="48" y1="42" x2="118" y2="78"/><line x1="188" y1="42" x2="258" y2="78"/><line x1="258" y1="78" x2="328" y2="114"/>
      </g>
      <circle cx="72" cy="58" r="5" fill="#8bbfc0"/>
      <circle cx="138" cy="92" r="4" fill="#b8d4c8"/>
      <circle cx="168" cy="52" r="7" fill="#5a9ea3"/>
      <circle cx="228" cy="98" r="5" fill="#a8c4c8"/>
      <circle cx="298" cy="46" r="6" fill="#6eaeb5"/>
      <circle cx="348" cy="82" r="14" fill="#4d8f96"/>
      <circle cx="42" cy="108" r="9" fill="#7eb5b8"/>
      <circle cx="252" cy="62" r="4" fill="#c5ddd0"/>
      <circle cx="318" cy="118" r="5" fill="#7aafb8"/>
      <circle cx="108" cy="70" r="3" fill="#a0c8cc"/>
      <circle cx="198" cy="38" r="4" fill="#9ec5c0"/>
    </svg>
  `),
  size: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <g stroke="#d0d0d0" stroke-width="1.5">
        <line x1="0" y1="50" x2="400" y2="50"/><line x1="0" y1="100" x2="400" y2="100"/>
        <line x1="80" y1="0" x2="80" y2="150"/><line x1="200" y1="0" x2="200" y2="150"/><line x1="320" y1="0" x2="320" y2="150"/>
      </g>
      <circle cx="95" cy="78" r="10" fill="#f28b2c"/>
      <circle cx="195" cy="72" r="16" fill="#f28b2c"/>
      <circle cx="295" cy="68" r="22" fill="#f28b2c"/>
    </svg>
  `),
  width_by_attribute: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <g stroke="#d0d0d0" stroke-width="1.5">
        <line x1="0" y1="50" x2="400" y2="50"/><line x1="0" y1="100" x2="400" y2="100"/>
        <line x1="80" y1="0" x2="80" y2="150"/><line x1="200" y1="0" x2="200" y2="150"/><line x1="320" y1="0" x2="320" y2="150"/>
      </g>
      <circle cx="95" cy="78" r="10" fill="#f28b2c"/>
      <circle cx="195" cy="72" r="16" fill="#f28b2c"/>
      <circle cx="295" cy="68" r="22" fill="#f28b2c"/>
    </svg>
  `),
  color_size: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <g stroke="#d0d0d0" stroke-width="1.5">
        <line x1="0" y1="50" x2="400" y2="50"/><line x1="0" y1="100" x2="400" y2="100"/>
        <line x1="100" y1="0" x2="100" y2="150"/><line x1="250" y1="0" x2="250" y2="150"/>
      </g>
      <circle cx="120" cy="76" r="12" fill="#29b6f6"/>
      <circle cx="280" cy="70" r="20" fill="#5c6bc0"/>
    </svg>
  `),
  dot_density: `url(${dotDensityThumbUrl})`,
  single_fill: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <g stroke="#f0f0f0" stroke-width="0.8">
        <path fill="#0d4f5c" d="M0 0 L72 0 L65 48 L0 55 Z"/>
        <path fill="#1a7a8c" d="M72 0 L158 0 L148 52 L65 48 Z"/>
        <path fill="#3eb3c4" d="M158 0 L248 0 L258 46 L148 52 Z"/>
        <path fill="#7ec8d4" d="M248 0 L330 0 L340 44 L258 46 Z"/>
        <path fill="#9dd9e5" d="M330 0 L400 0 L400 42 L340 44 Z"/>
        <path fill="#1a7a8c" d="M0 55 L65 48 L148 52 L138 98 L42 108 L0 150 Z"/>
        <path fill="#3eb3c4" d="M148 52 L258 46 L340 44 L400 42 L400 95 L280 105 L138 98 Z"/>
        <path fill="#0d4f5c" d="M42 108 L138 98 L180 150 L0 150 Z"/>
        <path fill="#7ec8d4" d="M138 98 L280 105 L260 150 L180 150 Z"/>
        <path fill="#9dd9e5" d="M280 105 L400 95 L400 150 L260 150 Z"/>
      </g>
    </svg>
  `),
  single: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <path fill="#f28b2c" d="M30 35 L110 22 L140 75 L95 110 L20 85 Z"/>
      <path fill="#f28b2c" d="M120 40 L200 28 L225 80 L175 105 L105 88 Z"/>
      <path fill="#f28b2c" d="M210 38 L290 26 L310 78 L255 102 L195 82 Z"/>
    </svg>
  `),
  location_only: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <path fill="#f28b2c" d="M30 35 L110 22 L140 75 L95 110 L20 85 Z"/>
      <path fill="#f28b2c" d="M120 40 L200 28 L225 80 L175 105 L105 88 Z"/>
      <path fill="#f28b2c" d="M210 38 L290 26 L310 78 L255 102 L195 82 Z"/>
    </svg>
  `),
  heatmap: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150">
      <rect width="400" height="150" fill="${MAP_BG}"/>
      <radialGradient id="h1" cx="35%" cy="42%"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.9"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0"/></radialGradient>
      <radialGradient id="h2" cx="62%" cy="55%"><stop offset="0%" stop-color="#facc15" stop-opacity="0.85"/><stop offset="100%" stop-color="#facc15" stop-opacity="0"/></radialGradient>
      <radialGradient id="h3" cx="48%" cy="48%"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
      <rect width="400" height="150" fill="url(#h3)"/><rect width="400" height="150" fill="url(#h2)"/><rect width="400" height="150" fill="url(#h1)"/>
    </svg>
  `),
  heat_surface: `url(${heatSurfaceThumbUrl})`,
  pie_chart: `url(${pieChartThumbUrl})`,
  extrusion_3d: `url(${extrusion3dThumbUrl})`,
};

/** Flat preview canvas only — no map graphic (reserved for future AGOL parity styles). */
export const SI_SYM_AGOL_THUMB_FLAT_BG: Record<string, string | undefined> = {};
