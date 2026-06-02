import { useMemo } from 'react';
import type { SiMapTerrainSettings } from '../utils/siMapProjectionTerrain';
import {
  SI_CONTOUR_SURFACE_OPTIONS,
  buildSiContourClassificationLegendItems,
} from '../utils/siContourClassification';
import './SiContourClassificationLegend.css';

export type SiContourClassificationLegendProps = {
  settings: SiMapTerrainSettings;
};

export function SiContourClassificationLegend({ settings }: SiContourClassificationLegendProps) {
  const items = useMemo(() => buildSiContourClassificationLegendItems(settings), [settings]);
  const surfaceLabel =
    SI_CONTOUR_SURFACE_OPTIONS.find(s => s.id === settings.contourSurfaceType)?.label ?? 'Elevation';

  if (!settings.contourEnabled || !settings.contourClassificationEnabled || items.length === 0) {
    return null;
  }

  return (
    <div
      className="si-contour-cls-legend"
      role="region"
      aria-label={`Contour classification legend — ${surfaceLabel}`}
    >
      <header className="si-contour-cls-legend__head">
        <i className="fa-solid fa-chart-area" aria-hidden />
        <div>
          <strong>Contours</strong>
          <span>{surfaceLabel}</span>
        </div>
      </header>
      <ul className="si-contour-cls-legend__list">
        {items.map(it => (
          <li key={it.valueKey} className="si-contour-cls-legend__row">
            <span className="si-contour-cls-legend__swatch" style={{ background: it.color }} aria-hidden />
            <span className="si-contour-cls-legend__label">{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
