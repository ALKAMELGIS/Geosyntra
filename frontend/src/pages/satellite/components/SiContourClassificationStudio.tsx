import { useMemo } from 'react';
import type { SiMapTerrainSettings } from '../utils/siMapProjectionTerrain';
import {
  SI_CONTOUR_LINE_WIDTH_MAX,
  SI_CONTOUR_LINE_WIDTH_MIN,
  SI_CONTOUR_MAIN_LINE_EVERY_MAX,
  SI_CONTOUR_MAIN_LINE_EVERY_MIN,
  clampContourLineWidth,
} from '../utils/siMapProjectionTerrain';
import {
  SI_CONTOUR_CLASS_METHOD_OPTIONS,
  SI_CONTOUR_SURFACE_OPTIONS,
  buildContourClassColorsFromRamp,
  buildSiContourClassificationLegendItems,
} from '../utils/siContourClassification';
import { clampInt } from '../symbologyHelpers';
import { siClassColorKey } from '../utils/siSymbologyLegendItems';
import { SI_SYMBOLOGY_RAMP_OPTIONS } from './siSymbologyStudioConstants';
import './SiContourClassificationStudio.css';

function rampCss(ramp: string): string {
  const map: Record<string, string> = {
    viridis: 'linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)',
    blues: 'linear-gradient(90deg,#f7fbff,#6baed6,#08306b)',
    greens: 'linear-gradient(90deg,#f7fcf5,#74c476,#00441b)',
    plasma: 'linear-gradient(90deg,#0d0887,#cc4778,#f0f921)',
    magma: 'linear-gradient(90deg,#000004,#b73779,#fcfdbf)',
    turbo: 'linear-gradient(90deg,#30123b,#6bc2a0,#fcffa4)',
    cividis: 'linear-gradient(90deg,#00204c,#7ea06a,#ffffe0)',
    spectral: 'linear-gradient(90deg,#9e0142,#f46d43,#fee08b,#66c2a5,#5e4fa2)',
    earth: 'linear-gradient(90deg,#8c510a,#d8b365,#f6e8c3,#5ab4ac,#01665e)',
    gray: 'linear-gradient(90deg,#f7f7f7,#969696,#252525)',
    inferno: 'linear-gradient(90deg,#000004,#bc3754,#fcffa4)',
  };
  return map[ramp] ?? map.viridis;
}

function ContourChip({
  checked,
  disabled,
  label,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <label className={'si-contour-cls-chip' + (checked ? ' si-contour-cls-chip--on' : '')} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export type SiContourClassificationStudioProps = {
  settings: SiMapTerrainSettings;
  disabled?: boolean;
  compact?: boolean;
  showMainLines?: boolean;
  showLabelsToggle?: boolean;
  onSettingsChange: (patch: Partial<SiMapTerrainSettings>) => void;
};

export function SiContourClassificationStudio({
  settings,
  disabled = false,
  compact = false,
  showMainLines = true,
  showLabelsToggle = true,
  onSettingsChange,
}: SiContourClassificationStudioProps) {
  const classes = clampInt(settings.contourClassCount, 2, 12);
  const legendItems = useMemo(
    () => buildSiContourClassificationLegendItems(settings),
    [settings],
  );

  const mainIntervalM = settings.contourIntervalM * settings.contourMainLineEvery;

  return (
    <div className={'si-contour-cls-studio' + (compact ? ' si-contour-cls-studio--compact' : '')}>
      <div className="si-contour-cls-kicker">Classification</div>
      <ContourChip
        checked={settings.contourClassificationEnabled}
        disabled={disabled || !settings.contourEnabled}
        label="Classify values"
        onChange={v => onSettingsChange({ contourClassificationEnabled: v })}
      />

      {settings.contourClassificationEnabled ? (
        <>
          <div className="si-sym-side-field">
            <span className="si-sym-side-label">Surface</span>
            <div className="si-contour-cls-segment" role="radiogroup" aria-label="Contour surface type">
              {SI_CONTOUR_SURFACE_OPTIONS.map(s => {
                const active = settings.contourSurfaceType === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={'si-contour-cls-segment__btn' + (active ? ' si-contour-cls-segment__btn--on' : '')}
                    disabled={disabled}
                    title={s.hint}
                    onClick={() => onSettingsChange({ contourSurfaceType: s.id })}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="si-sym-side-field">
            <span className="si-sym-side-label">Number of classes</span>
            <div className="si-sym-class-chips">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <button
                  key={n}
                  type="button"
                  className={`si-sym-class-chip${classes === n ? ' si-sym-class-chip--on' : ''}`}
                  disabled={disabled}
                  onClick={() =>
                    onSettingsChange({
                      contourClassCount: n,
                      contourClassColors: buildContourClassColorsFromRamp(
                        settings.contourColorRamp,
                        n,
                        settings.contourClassColors,
                      ),
                    })
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="si-sym-side-field">
            <span className="si-sym-side-label">Method</span>
            <div className="si-sym-method-chips">
              {SI_CONTOUR_CLASS_METHOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`si-sym-method-chip${settings.contourClassMethod === opt.value ? ' si-sym-method-chip--on' : ''}`}
                  disabled={disabled}
                  onClick={() => onSettingsChange({ contourClassMethod: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="si-sym-side-field">
            <span className="si-sym-side-label">Color ramp</span>
            <div className="si-sym-ramp-cards si-contour-cls-ramp-cards">
              {SI_SYMBOLOGY_RAMP_OPTIONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  className={`si-sym-ramp-card${settings.contourColorRamp === r.value ? ' si-sym-ramp-card--on' : ''}`}
                  title={r.label}
                  disabled={disabled}
                  onClick={() =>
                    onSettingsChange({
                      contourColorRamp: r.value,
                      contourClassColors: buildContourClassColorsFromRamp(
                        r.value,
                        classes,
                        settings.contourClassColors,
                      ),
                    })
                  }
                >
                  <span className="si-sym-ramp-card__strip" style={{ backgroundImage: rampCss(r.value) }} aria-hidden />
                  <span className="si-sym-ramp-card__label">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="si-sym-side-field">
            <span className="si-sym-side-label">Class colors</span>
            <div className="si-sym-side-value-list">
              {legendItems.map((it, idx) => (
                <div key={it.valueKey} className="si-sym-side-value-row">
                  <span
                    className="si-sym-side-value-row__swatch"
                    style={{ '--si-sym-fill': it.color, '--si-sym-outline': it.color } as React.CSSProperties}
                    aria-hidden
                  />
                  <span className="si-sym-side-value-row__label" title={it.label}>
                    {it.label}
                  </span>
                  <label className="si-sym-side-value-row__color-field" title="Line color">
                    <input
                      type="color"
                      className="si-sym-side-value-row__color-input"
                      value={it.color.startsWith('#') ? it.color : '#38bdf8'}
                      disabled={disabled}
                      onChange={e =>
                        onSettingsChange({
                          contourClassColors: {
                            ...settings.contourClassColors,
                            [siClassColorKey(idx)]: e.target.value,
                          },
                        })
                      }
                      aria-label={`Color for ${it.label}`}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="si-sym-side-slider">
            <div className="si-sym-side-slider__row">
              <span>Line width</span>
              <span>{settings.contourIntervalLineWidth.toFixed(2)} px</span>
            </div>
            <input
              type="range"
              min={SI_CONTOUR_LINE_WIDTH_MIN * 10}
              max={SI_CONTOUR_LINE_WIDTH_MAX * 10}
              disabled={disabled}
              value={Math.round(settings.contourIntervalLineWidth * 10)}
              onChange={e =>
                onSettingsChange({ contourIntervalLineWidth: clampContourLineWidth(Number(e.target.value) / 10) })
              }
            />
          </div>
        </>
      ) : null}

      {showLabelsToggle ? (
        <ContourChip
          checked={settings.contourLabelsEnabled}
          disabled={disabled || !settings.contourEnabled}
          label="Contour labels"
          title="Elevation text along contour lines"
          onChange={v => onSettingsChange({ contourLabelsEnabled: v })}
        />
      ) : null}

      {showMainLines ? (
        <>
          <ContourChip
            checked={settings.contourMainLinesEnabled}
            disabled={disabled || !settings.contourEnabled}
            label="Main lines"
            title={`Index every ${mainIntervalM} m`}
            onChange={v => onSettingsChange({ contourMainLinesEnabled: v })}
          />
          {settings.contourMainLinesEnabled ? (
            <div className="si-sym-side-slider">
              <div className="si-sym-side-slider__row">
                <span>Index ×</span>
                <span>×{settings.contourMainLineEvery}</span>
              </div>
              <input
                type="range"
                min={SI_CONTOUR_MAIN_LINE_EVERY_MIN}
                max={SI_CONTOUR_MAIN_LINE_EVERY_MAX}
                step={1}
                disabled={disabled}
                value={settings.contourMainLineEvery}
                onChange={e =>
                  onSettingsChange({
                    contourMainLineEvery: Math.min(
                      SI_CONTOUR_MAIN_LINE_EVERY_MAX,
                      Math.max(SI_CONTOUR_MAIN_LINE_EVERY_MIN, Math.round(Number(e.target.value))),
                    ),
                  })
                }
              />
            </div>
          ) : null}
        </>
      ) : null}

      {!settings.contourEnabled ? (
        <p className="si-contour-cls-hint">Enable contour lines first to classify them.</p>
      ) : settings.contourClassificationEnabled ? (
        <p className="si-contour-cls-hint">Map and legend update as you change options.</p>
      ) : null}
    </div>
  );
}
