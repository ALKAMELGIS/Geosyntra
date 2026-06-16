import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type {
  LayerLiveIndexSelectGroup,
  LayerLiveIndexSelectOption,
} from '../../../lib/siLayerLiveCompositeCatalog';

import './SiLayerLiveIndexSelect.css';

export type SiLayerLiveIndexSelectProps = {
  id?: string;
  label?: string;
  value: string;
  groups: LayerLiveIndexSelectGroup[];
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  /** Native `<select>` fallback for tests / no-JS (hidden when custom picker mounts). */
  nativeSelectClassName?: string;
};

function findOption(groups: LayerLiveIndexSelectGroup[], id: string) {
  for (const g of groups) {
    const hit = g.options.find(o => o.id === id);
    if (hit) return { group: g, option: hit };
  }
  return null;
}

function layerLiveOptionMatchesQuery(
  option: LayerLiveIndexSelectOption,
  group: LayerLiveIndexSelectGroup,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = `${option.abbr} ${option.sciName ?? ''} ${option.title} ${group.label} ${option.id}`.toLowerCase();
  return haystack.includes(query);
}

function layerLiveItemStyle(accentColor?: string): CSSProperties | undefined {
  if (!accentColor) return undefined;
  return { '--si-layer-live-accent': accentColor } as React.CSSProperties;
}

function LayerLiveAccentSwatch({ color }: { color: string }) {
  return (
    <span
      className="si-layer-live-index-select__swatch"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

function LayerLiveOptionLabel({
  abbr,
  sciName,
  accentColor,
}: {
  abbr: string;
  sciName?: string;
  accentColor?: string;
}) {
  return (
    <span className="si-layer-live-index-select__item-label">
      {accentColor ? <LayerLiveAccentSwatch color={accentColor} /> : null}
      <span className="si-layer-live-index-select__item-abbr">{abbr}</span>
      {sciName ? <span className="si-layer-live-index-select__item-sci">({sciName})</span> : null}
    </span>
  );
}

export function filterLayerLiveIndexSelectGroups(
  groups: readonly LayerLiveIndexSelectGroup[],
  rawQuery: string,
): LayerLiveIndexSelectGroup[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...groups];
  return groups
    .map(g => ({
      ...g,
      options: g.options.filter(o => layerLiveOptionMatchesQuery(o, g, query)),
    }))
    .filter(g => g.options.length > 0);
}

export function SiLayerLiveIndexSelect({
  id,
  label,
  value,
  groups,
  onChange,
  disabled = false,
  placeholder = 'Choose layer…',
  searchPlaceholder = 'Search layers…',
  className = '',
  nativeSelectClassName = '',
}: SiLayerLiveIndexSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => findOption(groups, value), [groups, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tmr = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(tmr);
  }, [open]);

  const flatOptions = useMemo(
    () => groups.flatMap(g => g.options.map(o => ({ ...o, groupLabel: g.label }))),
    [groups],
  );

  const filteredGroups = useMemo(
    () => filterLayerLiveIndexSelectGroups(groups, searchQuery),
    [groups, searchQuery],
  );

  return (
    <div className={`si-layer-live-index-select ${className}`.trim()} ref={rootRef}>
      {label ? (
        <span className="si-layer-live-index-select__label" id={id ? `${id}-label` : undefined}>
          {label}
        </span>
      ) : null}

      <select
        className={`si-layer-live-index-select__native ${nativeSelectClassName}`.trim()}
        value={value}
        disabled={disabled}
        aria-label={label || 'Layer'}
        onChange={e => onChange(e.target.value)}
      >
        {!value ? <option value="">{placeholder}</option> : null}
        {groups.map(g => (
          <optgroup key={g.key} label={g.label}>
            {g.options.map(o => (
              <option key={o.id} value={o.id} title={o.sciName ?? o.title}>
                {o.abbr}
                {o.sciName ? ` (${o.sciName})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <button
        id={id}
        type="button"
        className={`si-layer-live-index-select__trigger${open ? ' si-layer-live-index-select__trigger--open' : ''}${
          selected?.option.accentColor ? ' si-layer-live-index-select__trigger--accent' : ''
        }`}
        style={layerLiveItemStyle(selected?.option.accentColor)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={id && label ? `${id}-label` : undefined}
        title={selected?.option.title}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        {selected ? (
          <span className="si-layer-live-index-select__value">
            {selected.option.accentColor ? (
              <LayerLiveAccentSwatch color={selected.option.accentColor} />
            ) : null}
            <span className="si-layer-live-index-select__abbr">{selected.option.abbr}</span>
          </span>
        ) : (
          <span className="si-layer-live-index-select__placeholder">{placeholder}</span>
        )}
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
      </button>

      {open && !disabled ? (
        <div className="si-layer-live-index-select__panel" role="listbox" aria-label={label || 'Layer'}>
          <div className="si-layer-live-index-select__search-wrap">
            <label className="si-layer-live-index-select__search-label">
              <i className="fa-solid fa-magnifying-glass si-layer-live-index-select__search-icon" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                className="si-layer-live-index-select__search"
                value={searchQuery}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="si-layer-live-index-select__search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              ) : null}
            </label>
          </div>

          {filteredGroups.map(g => (
            <div key={g.key} className="si-layer-live-index-select__group">
              <div className="si-layer-live-index-select__group-label">{g.label}</div>
              <ul className="si-layer-live-index-select__list">
                {g.options.map(o => {
                  const on = o.id === value;
                  return (
                    <li key={o.id} role="option" aria-selected={on}>
                      <button
                        type="button"
                        className={`si-layer-live-index-select__item${on ? ' si-layer-live-index-select__item--on' : ''}${
                          o.accentColor ? ' si-layer-live-index-select__item--accent' : ''
                        }`}
                        style={layerLiveItemStyle(o.accentColor)}
                        data-index-id={o.id}
                        title={o.sciName ?? o.title}
                        aria-label={
                          o.sciName ? `${o.abbr} (${o.sciName})` : `${o.abbr} — ${o.title}`
                        }
                        onClick={() => {
                          onChange(o.id);
                          setOpen(false);
                        }}
                      >
                        <LayerLiveOptionLabel
                          abbr={o.abbr}
                          sciName={o.sciName}
                          accentColor={o.accentColor}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {!flatOptions.length ? (
            <p className="si-layer-live-index-select__empty">{placeholder}</p>
          ) : filteredGroups.length === 0 ? (
            <p className="si-layer-live-index-select__empty">No layers match your search.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


