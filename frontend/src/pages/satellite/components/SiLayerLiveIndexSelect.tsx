import { useEffect, useMemo, useRef, useState } from 'react';

import type { LayerLiveIndexSelectGroup } from '../../../lib/siLayerLiveCompositeCatalog';

import './SiLayerLiveIndexSelect.css';



export type SiLayerLiveIndexSelectProps = {

  id?: string;

  label?: string;

  value: string;

  groups: LayerLiveIndexSelectGroup[];

  onChange: (id: string) => void;

  disabled?: boolean;

  placeholder?: string;

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



export function SiLayerLiveIndexSelect({

  id,

  label,

  value,

  groups,

  onChange,

  disabled = false,

  placeholder = 'Choose layer…',

  className = '',

  nativeSelectClassName = '',

}: SiLayerLiveIndexSelectProps) {

  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => findOption(groups, value), [groups, value]);



  useEffect(() => {

    if (!open) return;

    const close = (e: PointerEvent) => {

      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);

    };

    document.addEventListener('pointerdown', close, true);

    return () => document.removeEventListener('pointerdown', close, true);

  }, [open]);



  const flatOptions = useMemo(

    () => groups.flatMap(g => g.options.map(o => ({ ...o, groupLabel: g.label }))),

    [groups],

  );



  return (

    <div

      className={`si-layer-live-index-select ${className}`.trim()}

      ref={rootRef}

    >

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

              <option key={o.id} value={o.id} title={o.title}>

                {o.abbr}

              </option>

            ))}

          </optgroup>

        ))}

      </select>



      <button

        id={id}

        type="button"

        className={`si-layer-live-index-select__trigger${open ? ' si-layer-live-index-select__trigger--open' : ''}`}

        disabled={disabled}

        aria-haspopup="listbox"

        aria-expanded={open}

        aria-labelledby={id && label ? `${id}-label` : undefined}

        title={selected?.option.title}

        onClick={() => !disabled && setOpen(o => !o)}

      >

        {selected ? (

          <span className="si-layer-live-index-select__value">

            <span className="si-layer-live-index-select__abbr">{selected.option.abbr}</span>

          </span>

        ) : (

          <span className="si-layer-live-index-select__placeholder">{placeholder}</span>

        )}

        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />

      </button>



      {open && !disabled ? (

        <div className="si-layer-live-index-select__panel" role="listbox" aria-label={label || 'Layer'}>

          {groups.map(g => (

            <div key={g.key} className="si-layer-live-index-select__group">

              <div className="si-layer-live-index-select__group-label">{g.label}</div>

              <ul className="si-layer-live-index-select__list">

                {g.options.map(o => {

                  const on = o.id === value;

                  return (

                    <li key={o.id} role="option" aria-selected={on}>

                      <button

                        type="button"

                        className={`si-layer-live-index-select__item${on ? ' si-layer-live-index-select__item--on' : ''}`}

                        title={o.title}

                        aria-label={`${o.abbr} — ${o.title}`}

                        onClick={() => {

                          onChange(o.id);

                          setOpen(false);

                        }}

                      >

                        <span className="si-layer-live-index-select__item-abbr">{o.abbr}</span>

                      </button>

                    </li>

                  );

                })}

              </ul>

            </div>

          ))}

          {!flatOptions.length ? (

            <p className="si-layer-live-index-select__empty">{placeholder}</p>

          ) : null}

        </div>

      ) : null}

    </div>

  );

}


