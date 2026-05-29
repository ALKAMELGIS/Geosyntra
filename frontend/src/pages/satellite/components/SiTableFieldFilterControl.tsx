import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './FieldVisibilityControl.css';

export type SiTableFilterOperator = 'contains' | 'equals' | 'not_equals' | 'empty' | 'not_empty';

export const SI_TABLE_FILTER_OPERATORS: ReadonlyArray<{ value: SiTableFilterOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'empty', label: 'Is empty' },
  { value: 'not_empty', label: 'Is not empty' },
];

export type SiTableFieldFilterControlProps = {
  fields: string[];
  filterField: string;
  filterOperator: SiTableFilterOperator;
  filterValue: string;
  onFilterFieldChange: (field: string) => void;
  onFilterOperatorChange: (op: SiTableFilterOperator) => void;
  onFilterValueChange: (value: string) => void;
  onClearFilter: () => void;
  triggerClassName?: string;
};

const POPOVER_WIDTH = 380;
const FILTER_POPOVER_Z = 12950;

export function SiTableFieldFilterControl({
  fields,
  filterField,
  filterOperator,
  filterValue,
  onFilterFieldChange,
  onFilterOperatorChange,
  onFilterValueChange,
  onClearFilter,
  triggerClassName,
}: SiTableFieldFilterControlProps) {
  const headingId = useId();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<null | { top: number; left: number }>(null);

  const hasActiveFilter = Boolean(filterField || filterValue.trim());

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const margin = 8;
      const maxH = Math.min(560, window.innerHeight * 0.78);
      let left = r.left;
      if (left + POPOVER_WIDTH > window.innerWidth - margin) left = window.innerWidth - POPOVER_WIDTH - margin;
      if (left < margin) left = margin;
      let top = r.bottom + margin;
      if (top + maxH > window.innerHeight - margin) {
        top = Math.max(margin, r.top - maxH - margin);
      }
      setPos({ left, top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (btnRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (filterOperator === 'empty' || filterOperator === 'not_empty') return;
    const id = window.setTimeout(() => valueRef.current?.focus?.(), 0);
    return () => window.clearTimeout(id);
  }, [open, filterOperator]);

  const popover =
    open && pos ? (
      <div
        ref={popRef}
        className="gis-fieldvis-popover si-table-filter-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          left: `${pos.left}px`,
          top: `${pos.top}px`,
          width: `${POPOVER_WIDTH}px`,
          zIndex: FILTER_POPOVER_Z,
        }}
        dir="ltr"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="gis-fieldvis-popover__header">
          <h2 className="gis-fieldvis-popover__title" id={headingId}>
            Filter options
          </h2>
          <button
            type="button"
            className="gis-fieldvis-popover__close"
            aria-label="Close filter options"
            onClick={() => setOpen(false)}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="si-table-field-filter si-table-field-filter--popover" role="group" aria-label="Field filter">
          <div className="si-table-field-filter__block">
            <span className="si-table-field-filter__kicker">Field</span>
            <div className="si-table-field-filter__chips" role="group" aria-label="Filter field">
              <button
                type="button"
                className={`si-table-field-filter__chip${filterField === '' ? ' is-active' : ''}`}
                aria-pressed={filterField === ''}
                onClick={() => onFilterFieldChange('')}
              >
                All records
              </button>
              {fields.map(f => (
                <button
                  key={f}
                  type="button"
                  className={`si-table-field-filter__chip${filterField === f ? ' is-active' : ''}`}
                  aria-pressed={filterField === f}
                  title={f}
                  onClick={() => onFilterFieldChange(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="si-table-field-filter__block">
            <span className="si-table-field-filter__kicker">Rule</span>
            <div className="si-table-field-filter__chips" role="group" aria-label="Filter rule">
              {SI_TABLE_FILTER_OPERATORS.map(op => (
                <button
                  key={op.value}
                  type="button"
                  className={`si-table-field-filter__chip${filterOperator === op.value ? ' is-active' : ''}`}
                  aria-pressed={filterOperator === op.value}
                  onClick={() => onFilterOperatorChange(op.value)}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
          {filterOperator !== 'empty' && filterOperator !== 'not_empty' ? (
            <div className="si-table-field-filter__block si-table-field-filter__block--value">
              <label className="si-table-field-filter__value-label" htmlFor={`${headingId}-value`}>
                Value
              </label>
              <input
                ref={valueRef}
                id={`${headingId}-value`}
                className="si-table-field-filter__input"
                value={filterValue}
                onChange={e => onFilterValueChange(e.target.value)}
                placeholder="Type to match…"
                aria-label="Filter value"
              />
            </div>
          ) : null}
          <button
            type="button"
            className="si-table-field-filter__clear"
            onClick={() => {
              onClearFilter();
              setOpen(false);
            }}
          >
            Clear filter
          </button>
        </div>

        <footer className="gis-fieldvis-popover__footer">
          <button type="button" className="gis-fieldvis-popover__done" onClick={() => setOpen(false)}>
            Done
          </button>
        </footer>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={[
          'gis-fieldvis-trigger',
          open || hasActiveFilter ? 'gis-fieldvis-trigger--open' : '',
          triggerClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Filter options"
        title="Filter options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <i className="fa-solid fa-filter" aria-hidden />
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
