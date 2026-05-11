import type { SiAoiFieldRecord } from '../../../lib/siAoiFields';

export type SiAoiFieldsPanelProps = {
  hasAoi: boolean;
  drawTargetMode: 'aoi' | 'field';
  onDrawTargetMode: (mode: 'aoi' | 'field') => void;
  fields: SiAoiFieldRecord[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onRenameField: (id: string, name: string) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onRotateField: (id: string, deg: number) => void;
  fieldSnap: boolean;
  onFieldSnap: (v: boolean) => void;
  fieldNoOverlap: boolean;
  onFieldNoOverlap: (v: boolean) => void;
  mergePick: [string | null, string | null];
  onMergePick: (slot: 0 | 1, id: string | null) => void;
  onMergeFields: () => void;
  onCopyGeometry: () => void;
  onPasteGeometry: () => void;
  canPaste: boolean;
  onExportFieldsGeoJson: () => void;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onImportGeojson: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function SiAoiFieldsPanel(props: SiAoiFieldsPanelProps) {
  const {
    hasAoi,
    drawTargetMode,
    onDrawTargetMode,
    fields,
    selectedFieldId,
    onSelectField,
    onRenameField,
    onDeleteField,
    onDuplicateField,
    onRotateField,
    fieldSnap,
    onFieldSnap,
    fieldNoOverlap,
    onFieldNoOverlap,
    mergePick,
    onMergePick,
    onMergeFields,
    onCopyGeometry,
    onPasteGeometry,
    canPaste,
    onExportFieldsGeoJson,
    importInputRef,
    onImportGeojson,
  } = props;

  return (
    <div className="si-aoi-fields-panel">
      <div className="si-field-analysis-kicker">AOI vs fields</div>
      <p className="si-aoi-fields-hint">
        Draw the outer <strong>AOI</strong> first, switch to <strong>Fields</strong>, then use rectangle / polygon / circle to add
        independent field polygons inside the AOI.
      </p>
      <div className="si-aoi-fields-target-toggle" role="group" aria-label="Draw target">
        <button
          type="button"
          className={`si-aoi-fields-target-btn${drawTargetMode === 'aoi' ? ' si-aoi-fields-target-btn--on' : ''}`}
          onClick={() => onDrawTargetMode('aoi')}
        >
          AOI
        </button>
        <button
          type="button"
          className={`si-aoi-fields-target-btn${drawTargetMode === 'field' ? ' si-aoi-fields-target-btn--on' : ''}`}
          disabled={!hasAoi}
          title={!hasAoi ? 'Draw an AOI first' : 'Add fields inside AOI'}
          onClick={() => onDrawTargetMode('field')}
        >
          Fields
        </button>
      </div>
      <div className="si-aoi-fields-options">
        <label className="si-field-analysis-checkbox-row">
          <input type="checkbox" checked={fieldSnap} onChange={e => onFieldSnap(e.target.checked)} />
          <span>Snap vertices to AOI &amp; other fields while sketching</span>
        </label>
        <label className="si-field-analysis-checkbox-row">
          <input type="checkbox" checked={fieldNoOverlap} onChange={e => onFieldNoOverlap(e.target.checked)} />
          <span>Block new fields if they overlap existing (approx.)</span>
        </label>
      </div>
      <div className="si-aoi-fields-actions">
        <button type="button" className="si-aoi-fields-action" disabled={!selectedFieldId} onClick={onCopyGeometry}>
          Copy geometry
        </button>
        <button type="button" className="si-aoi-fields-action" disabled={!canPaste} onClick={onPasteGeometry}>
          Paste geometry
        </button>
        <button type="button" className="si-aoi-fields-action" disabled={!fields.length} onClick={onExportFieldsGeoJson}>
          Export fields (.geojson)
        </button>
        <input ref={importInputRef} type="file" accept=".geojson,.json,application/geo+json" className="si-sr-only" onChange={onImportGeojson} />
        <button type="button" className="si-aoi-fields-action" disabled={!hasAoi} onClick={() => importInputRef.current?.click()}>
          Import fields
        </button>
      </div>
      <div className="si-aoi-fields-merge">
        <div className="si-field-analysis-kicker">Merge two polygons</div>
        <p className="si-aoi-fields-hint">Pick two polygon fields → merges into one MultiPolygon field (split line-cut is not automated yet).</p>
        <div className="si-aoi-fields-merge-row">
          <select
            className="si-aoi-fields-merge-select"
            value={mergePick[0] ?? ''}
            onChange={e => onMergePick(0, e.target.value || null)}
            aria-label="First field for merge"
          >
            <option value="">Field A…</option>
            {fields.map(f => (
              <option key={`a-${f.id}`} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            className="si-aoi-fields-merge-select"
            value={mergePick[1] ?? ''}
            onChange={e => onMergePick(1, e.target.value || null)}
            aria-label="Second field for merge"
          >
            <option value="">Field B…</option>
            {fields.map(f => (
              <option key={`b-${f.id}`} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="si-aoi-fields-action si-aoi-fields-action--primary"
            disabled={!mergePick[0] || !mergePick[1] || mergePick[0] === mergePick[1]}
            onClick={onMergeFields}
          >
            Merge
          </button>
        </div>
      </div>
      <div className="si-field-analysis-kicker">Field list ({fields.length})</div>
      {fields.length === 0 ? (
        <p className="si-aoi-fields-empty">No fields yet. Switch to Fields and sketch inside the AOI.</p>
      ) : (
        <ul className="si-aoi-fields-list">
          {fields.map(f => (
            <li
              key={f.id}
              className={`si-aoi-fields-list-item${selectedFieldId === f.id ? ' si-aoi-fields-list-item--active' : ''}`}
            >
              <button type="button" className="si-aoi-fields-list-select" onClick={() => onSelectField(f.id)}>
                <span className="si-aoi-fields-swatch" style={{ background: f.style.strokeColor }} aria-hidden />
                <span className="si-aoi-fields-list-name">{f.name}</span>
              </button>
              <span className="si-aoi-fields-metrics">
                {f.areaHa.toFixed(2)} ha · {Math.round(f.perimeterM)} m
              </span>
              <div className="si-aoi-fields-row-tools">
                <input
                  className="si-aoi-fields-rename"
                  aria-label={`Rename ${f.name}`}
                  defaultValue={f.name}
                  key={f.id}
                  onBlur={e => onRenameField(f.id, e.target.value.trim() || f.name)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
                <button type="button" className="si-aoi-fields-icon" title="Duplicate" onClick={() => onDuplicateField(f.id)}>
                  <i className="fa-regular fa-copy" aria-hidden />
                </button>
                <button type="button" className="si-aoi-fields-icon" title="Rotate −5°" onClick={() => onRotateField(f.id, -5)}>
                  <i className="fa-solid fa-rotate-left" aria-hidden />
                </button>
                <button type="button" className="si-aoi-fields-icon" title="Rotate +5°" onClick={() => onRotateField(f.id, 5)}>
                  <i className="fa-solid fa-rotate-right" aria-hidden />
                </button>
                <button type="button" className="si-aoi-fields-icon si-aoi-fields-icon--danger" title="Delete" onClick={() => onDeleteField(f.id)}>
                  <i className="fa-solid fa-trash" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
