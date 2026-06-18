import { useId, useMemo, useState } from 'react';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  STATIC_AOI_CHART_LAYER_INLINE_IDS,
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';

export type StaticAoiComparisonLayerToolbarProps = {
  staticComparisonLayers: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle: (id: StaticAoiChartLayerId) => void;
};

export function StaticAoiComparisonLayerToolbar({
  staticComparisonLayers,
  onStaticComparisonLayerToggle,
}: StaticAoiComparisonLayerToolbarProps) {
  const [moreValue, setMoreValue] = useState('');
  const selectId = useId();

  const inlineOptions = useMemo(
    () =>
      STATIC_AOI_CHART_LAYER_INLINE_IDS.map(id => STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id)!).filter(
        Boolean,
      ),
    [],
  );

  const overflowOptions = useMemo(
    () => STATIC_AOI_CHART_LAYER_OPTIONS.filter(o => !STATIC_AOI_CHART_LAYER_INLINE_IDS.includes(o.id)),
    [],
  );

  const activeOverflowChips = useMemo(
    () => overflowOptions.filter(o => staticComparisonLayers.includes(o.id)),
    [overflowOptions, staticComparisonLayers],
  );

  return (
    <div className="si-map-analysis-layer-toolbar" role="group" aria-label="WMS comparison layers">
      {inlineOptions.map(opt => {
        const on = staticComparisonLayers.includes(opt.id);
        const onlyOne = staticComparisonLayers.length <= 1;
        return (
          <button
            key={opt.id}
            type="button"
            className={`si-map-analysis-layer-chip ${on ? 'si-map-analysis-layer-chip--on' : ''}`}
            title={opt.subtitle}
            aria-pressed={on}
            disabled={on && onlyOne}
            onClick={() => onStaticComparisonLayerToggle(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
      {activeOverflowChips.map(opt => {
        const on = staticComparisonLayers.includes(opt.id);
        const onlyOne = staticComparisonLayers.length <= 1;
        return (
          <button
            key={opt.id}
            type="button"
            className={`si-map-analysis-layer-chip ${on ? 'si-map-analysis-layer-chip--on' : ''}`}
            title={opt.subtitle}
            aria-pressed={on}
            disabled={on && onlyOne}
            onClick={() => onStaticComparisonLayerToggle(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
      {overflowOptions.length > 0 ? (
        <div className="si-map-analysis-layer-more">
          <label htmlFor={selectId} className="si-map-analysis-layer-more-label">
            More
          </label>
          <select
            id={selectId}
            className="si-map-analysis-layer-more-select"
            title="Additional spectral indices"
            aria-label="More spectral indices"
            value={moreValue}
            onChange={e => {
              const v = e.target.value as StaticAoiChartLayerId;
              if (!v) return;
              onStaticComparisonLayerToggle(v);
              setMoreValue('');
            }}
          >
            <option value="">Indices…</option>
            {overflowOptions.map(opt => {
              const on = staticComparisonLayers.includes(opt.id);
              const onlyOne = staticComparisonLayers.length <= 1;
              return (
                <option key={opt.id} value={opt.id} disabled={on && onlyOne}>
                  {opt.label} — {opt.subtitle}
                </option>
              );
            })}
          </select>
        </div>
      ) : null}
    </div>
  );
}
