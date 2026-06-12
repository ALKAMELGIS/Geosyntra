import { useMemo } from 'react';
import type {
  SiSymbologyAttributeRotation,
  SiSymbologyAttributeTransparency,
} from '../../../lib/gisLayerTypes';
import {
  DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION,
  DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY,
  computeFieldNumericStats,
  sanitizeSiSymbologyAttributeRotation,
  sanitizeSiSymbologyAttributeTransparency,
  suggestAttributeTransparencyForField,
} from '../utils/siSymbologyAttributeDrive';
import './SiSymbologyAttributePanels.css';
import { SiSymbologyLightSelect } from './SiSymbologyLightSelect';

function AgolSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <label className="si-sym-agol-switch-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        className={`si-sym-agol-switch${checked ? ' si-sym-agol-switch--on' : ''}`}
        aria-checked={checked}
        aria-label={label}
        onClick={e => {
          e.stopPropagation();
          onChange(!checked);
        }}
      >
        <span className="si-sym-agol-switch__thumb" aria-hidden />
      </button>
    </label>
  );
}

function FieldRow({
  label,
  value,
  fields,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string;
  fields: string[];
  onChange: (field: string) => void;
  allowEmpty?: boolean;
}) {
  const fieldId = `si-sym-attr-${label.replace(/\s+/g, '-')}`;
  const options = fields.filter(Boolean).map(f => ({ value: f, label: f }));

  return (
    <div className="si-sym-attr-field">
      <label className="si-sym-side-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="si-sym-attr-field__row">
        <SiSymbologyLightSelect
          id={fieldId}
          value={value}
          options={options}
          onChange={onChange}
          allowEmpty={allowEmpty ?? !value}
          placeholder="Choose a field"
          className="si-sym-attr-field__select"
        />
        <button type="button" className="si-sym-attr-expr-btn" title="Expression (coming soon)" disabled>
          <i className="fa-solid fa-code" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function PctStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="si-sym-attr-range-row">
      <span className="si-sym-attr-range-row__label">{label}</span>
      <div className="si-sym-attr-numwrap">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={e => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.max(0, Math.min(100, Math.round(n))));
          }}
        />
        <span className="si-sym-attr-numwrap__unit">%</span>
      </div>
    </div>
  );
}

function TransparencyHistogram({
  cfg,
  stats,
  onPatch,
}: {
  cfg: SiSymbologyAttributeTransparency;
  stats: ReturnType<typeof computeFieldNumericStats>;
  onPatch: (p: Partial<SiSymbologyAttributeTransparency>) => void;
}) {
  const lowOp = 1 - cfg.lowTransparency / 100;
  const highOp = 1 - cfg.highTransparency / 100;

  return (
    <div className="si-sym-attr-hist">
      <div className="si-sym-attr-hist__tools">
        <button type="button" className="si-sym-attr-hist__tool" title="Zoom histogram" disabled>
          <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
        </button>
        <button
          type="button"
          className="si-sym-attr-hist__tool"
          title="Reset range to data extent"
          onClick={() =>
            onPatch({
              valueMin: stats.min,
              valueMax: stats.max === stats.min ? stats.min + 1 : stats.max,
            })
          }
        >
          <i className="fa-solid fa-rotate-left" aria-hidden />
        </button>
      </div>
      <div className="si-sym-attr-hist__body">
        <div className="si-sym-attr-hist__values">
          <label className="si-sym-attr-hist__val">
            <span className="si-sym-attr-hist__val-label">High</span>
            <input
              type="number"
              step="any"
              value={Number(cfg.valueMax.toFixed(2))}
              onChange={e => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onPatch({ valueMax: n });
              }}
            />
          </label>
          <label className="si-sym-attr-hist__val">
            <span className="si-sym-attr-hist__val-label">Low</span>
            <input
              type="number"
              step="any"
              value={Number(cfg.valueMin.toFixed(2))}
              onChange={e => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onPatch({ valueMin: n });
              }}
            />
          </label>
        </div>
        <div
          className="si-sym-attr-hist__bar"
          style={
            {
              '--si-hist-top': highOp,
              '--si-hist-bottom': lowOp,
            } as React.CSSProperties
          }
          aria-hidden
        />
        <div className="si-sym-attr-hist__stats">
          <span>+σ {stats.stdDev.toFixed(1)}</span>
          <span>x̄ {stats.mean.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function RotationDial({ mode }: { mode: SiSymbologyAttributeRotation['mode'] }) {
  return (
    <div className="si-sym-attr-rotation-dial" aria-hidden>
      <svg viewBox="0 0 120 120" className="si-sym-attr-rotation-dial__svg">
        <circle cx="60" cy="60" r="48" fill="#f3f3f3" stroke="#c8c8c8" strokeWidth="1" />
        <line x1="60" y1="60" x2="60" y2="18" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="60" y1="60" x2="102" y2="60" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
        <polygon points="52,44 68,44 60,56" fill="#64748b" transform="rotate(35 60 52)" />
        <path
          d="M 60 22 A 38 38 0 0 1 95 60"
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="2"
          markerEnd="url(#si-rot-arrow)"
        />
        <text x="60" y="14" textAnchor="middle" fontSize="10" fill="#4a4a4a">
          0°
        </text>
        <text x="108" y="64" textAnchor="middle" fontSize="10" fill="#4a4a4a">
          90°
        </text>
        <defs>
          <marker id="si-rot-arrow" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#0a0a0a" />
          </marker>
        </defs>
      </svg>
      <span className="si-sym-attr-rotation-dial__mode">
        {mode === 'geographic' ? 'Geographic (0° = north)' : 'Arithmetic (0° = east)'}
      </span>
    </div>
  );
}

export type SiSymbologyAttributePanelsProps = {
  geojson: unknown;
  allFields: string[];
  numericFields: string[];
  defaultField?: string;
  transparency: SiSymbologyAttributeTransparency | undefined;
  rotation: SiSymbologyAttributeRotation | undefined;
  transparencyOpen: boolean;
  rotationOpen: boolean;
  onTransparencyOpenChange: (open: boolean) => void;
  onRotationOpenChange: (open: boolean) => void;
  onTransparencyChange: (next: SiSymbologyAttributeTransparency) => void;
  onRotationChange: (next: SiSymbologyAttributeRotation) => void;
};

export function SiSymbologyAttributePanels({
  geojson,
  allFields,
  numericFields,
  defaultField = '',
  transparency,
  rotation,
  transparencyOpen,
  rotationOpen,
  onTransparencyOpenChange,
  onRotationOpenChange,
  onTransparencyChange,
  onRotationChange,
}: SiSymbologyAttributePanelsProps) {
  const transCfg = sanitizeSiSymbologyAttributeTransparency(transparency);
  const rotCfg = sanitizeSiSymbologyAttributeRotation(rotation);
  const fieldChoices = numericFields.length ? numericFields : allFields;

  const transStats = useMemo(
    () => computeFieldNumericStats(geojson, transCfg.field || defaultField),
    [geojson, transCfg.field, defaultField],
  );

  const patchTrans = (p: Partial<SiSymbologyAttributeTransparency>) =>
    onTransparencyChange(sanitizeSiSymbologyAttributeTransparency({ ...transCfg, ...p }));

  const patchRot = (p: Partial<SiSymbologyAttributeRotation>) =>
    onRotationChange(sanitizeSiSymbologyAttributeRotation({ ...rotCfg, ...p }));

  const enableTransparency = (on: boolean) => {
    if (!on) {
      patchTrans({ enabled: false });
      return;
    }
    const field =
      transCfg.field ||
      (defaultField && fieldChoices.includes(defaultField) ? defaultField : fieldChoices[0] || '');
    onTransparencyChange(
      suggestAttributeTransparencyForField(geojson, field, {
        ...transCfg,
        enabled: true,
      }),
    );
  };

  const enableRotation = (on: boolean) => {
    if (!on) {
      patchRot({ enabled: false });
      return;
    }
    const field =
      rotCfg.field ||
      (defaultField && fieldChoices.includes(defaultField) ? defaultField : fieldChoices[0] || '');
    patchRot({ enabled: true, field });
  };

  return (
    <>
      <div className="si-sym-side-acc">
        <button
          type="button"
          className="si-sym-side-acc__trigger"
          onClick={() => onTransparencyOpenChange(!transparencyOpen)}
        >
          Transparency by attribute
          <i className={`fa-solid fa-chevron-${transparencyOpen ? 'up' : 'down'}`} aria-hidden />
        </button>
        {transparencyOpen ? (
          <div className="si-sym-side-acc__body si-sym-side-acc__body--attr">
            <AgolSwitch
              checked={transCfg.enabled}
              onChange={enableTransparency}
              label="Set transparency based on attribute values"
            />
            {transCfg.enabled ? (
              <div className="si-sym-attr-panel">
                <FieldRow
                  label="Field"
                  value={transCfg.field}
                  fields={fieldChoices}
                  onChange={field =>
                    onTransparencyChange(suggestAttributeTransparencyForField(geojson, field, transCfg))
                  }
                />
                <FieldRow
                  label="Divided by"
                  value={transCfg.dividedByField}
                  fields={fieldChoices}
                  allowEmpty
                  onChange={dividedByField => patchTrans({ dividedByField })}
                />
                <TransparencyHistogram cfg={transCfg} stats={transStats} onPatch={patchTrans} />
                <div className="si-sym-attr-range-block">
                  <span className="si-sym-side-label">Transparency range</span>
                  <PctStepper
                    label="High values"
                    value={transCfg.highTransparency}
                    onChange={highTransparency => patchTrans({ highTransparency })}
                  />
                  <PctStepper
                    label="Low values"
                    value={transCfg.lowTransparency}
                    onChange={lowTransparency => patchTrans({ lowTransparency })}
                  />
                </div>
                <AgolSwitch
                  checked={transCfg.includeInLegend}
                  onChange={includeInLegend => patchTrans({ includeInLegend })}
                  label="Include in legend"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="si-sym-side-acc">
        <button
          type="button"
          className="si-sym-side-acc__trigger"
          onClick={() => onRotationOpenChange(!rotationOpen)}
        >
          Rotation by attribute
          <i className={`fa-solid fa-chevron-${rotationOpen ? 'up' : 'down'}`} aria-hidden />
        </button>
        {rotationOpen ? (
          <div className="si-sym-side-acc__body si-sym-side-acc__body--attr">
            <AgolSwitch
              checked={rotCfg.enabled}
              onChange={enableRotation}
              label="Rotate symbols based on attribute values"
            />
            {rotCfg.enabled ? (
              <div className="si-sym-attr-panel">
                <FieldRow
                  label="Field"
                  value={rotCfg.field}
                  fields={fieldChoices}
                  onChange={field => patchRot({ field })}
                />
                <fieldset className="si-sym-attr-radio-group">
                  <legend className="si-sym-attr-radio-group__legend">Rotation type</legend>
                  <label className="si-sym-attr-radio">
                    <input
                      type="radio"
                      name="si-sym-rotation-mode"
                      checked={rotCfg.mode === 'geographic'}
                      onChange={() => patchRot({ mode: 'geographic' })}
                    />
                    <span>Geographic</span>
                  </label>
                  <label className="si-sym-attr-radio">
                    <input
                      type="radio"
                      name="si-sym-rotation-mode"
                      checked={rotCfg.mode === 'arithmetic'}
                      onChange={() => patchRot({ mode: 'arithmetic' })}
                    />
                    <span>Arithmetic</span>
                  </label>
                </fieldset>
                <RotationDial mode={rotCfg.mode} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

export {
  DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY,
  DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION,
};
