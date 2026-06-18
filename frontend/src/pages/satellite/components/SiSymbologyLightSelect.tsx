import { useEffect, useRef, useState } from 'react';

export type SiSymbologyLightSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export type SiSymbologyLightSelectProps<T extends string = string> = {
  id?: string;
  label?: string;
  value: T | '';
  options: SiSymbologyLightSelectOption<T>[];
  onChange: (value: T | '') => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
};

export function SiSymbologyLightSelect<T extends string = string>({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  className = '',
  allowEmpty = false,
}: SiSymbologyLightSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const display = selected?.label ?? (allowEmpty || !value ? placeholder : value);

  return (
    <div
      ref={rootRef}
      className={`si-sym-side-field si-sym-side-field-picker si-sym-side-field-picker--menu${open ? ' si-sym-side-field-picker--open' : ''} ${className}`.trim()}
    >
      {label ? (
        <label className="si-sym-side-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        className="si-sym-side-field-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>{display}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
      </button>
      {open ? (
        <ul className="si-sym-side-field-picker__list" role="listbox" aria-labelledby={id}>
          {allowEmpty ? (
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`si-sym-side-field-picker__item${!value ? ' si-sym-side-field-picker__item--on' : ''}`}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {placeholder}
              </button>
            </li>
          ) : null}
          {options.map(o => {
            const on = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button
                  type="button"
                  className={`si-sym-side-field-picker__item${on ? ' si-sym-side-field-picker__item--on' : ''}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export const SI_SYM_RAMP_CATEGORY_OPTIONS = [
  { value: 'all', label: 'All color ramps' },
  { value: 'light', label: 'Best for light backgrounds' },
  { value: 'dark', label: 'Best for dark backgrounds' },
  { value: 'reds', label: 'Reds and yellows' },
  { value: 'greens', label: 'Greens' },
  { value: 'blues', label: 'Blues' },
  { value: 'grays', label: 'Grays' },
  { value: 'bright', label: 'Bright' },
  { value: 'subdued', label: 'Subdued' },
  { value: 'colorblind', label: 'Colorblind friendly' },
] as const;

export type SiSymRampCategory = (typeof SI_SYM_RAMP_CATEGORY_OPTIONS)[number]['value'];
