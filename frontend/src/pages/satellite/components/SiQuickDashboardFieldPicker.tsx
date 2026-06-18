import { useEffect, useMemo, useRef, useState } from 'react';
import type { SiQuickFieldMeta } from '../utils/siQuickDashboardEngine';
import { chartKindLabel } from './SiQuickDashboardCharts';

export type SiQuickDashboardFieldPickerProps = {
  fields: SiQuickFieldMeta[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectMany: (keys: string[]) => void;
  onClear: () => void;
  language?: string;
  dir?: 'rtl' | 'ltr';
};

function t(lang: string | undefined, en: string, ar: string): string {
  return lang === 'ar' ? ar : en;
}

export function SiQuickDashboardFieldPicker({
  fields,
  selected,
  onToggle,
  onSelectMany,
  onClear,
  language,
  dir,
}: SiQuickDashboardFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(
      f =>
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.kind.toLowerCase().includes(q),
    );
  }, [fields, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const triggerLabel =
    selected.size === 0
      ? t(language, 'All fields (auto)', 'كل الحقول (تلقائي)')
      : t(language, `${selected.size} field(s) selected`, `${selected.size} حقل محدد`);

  const selectAllFiltered = () => onSelectMany(filtered.map(f => f.key));

  return (
    <div className="si-qdash-field-picker" ref={rootRef} dir={dir}>
      <label className="si-qdash-field">
        <span>{t(language, 'Fields', 'الحقول')}</span>
        <button
          type="button"
          className={
            'si-qdash-field-dropdown-trigger' + (open ? ' si-qdash-field-dropdown-trigger--open' : '')
          }
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="si-qdash-field-dropdown-trigger__label">{triggerLabel}</span>
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
        </button>
      </label>

      {open ? (
        <div className="si-qdash-field-dropdown" role="listbox" aria-multiselectable="true">
          <div className="si-qdash-field-dropdown__search-wrap">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="search"
              className="si-qdash-field-dropdown__search"
              placeholder={t(language, 'Search fields…', 'بحث في الحقول…')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label={t(language, 'Search fields', 'بحث في الحقول')}
              autoFocus
            />
          </div>

          <div className="si-qdash-field-dropdown__actions">
            <button type="button" onClick={selectAllFiltered} disabled={!filtered.length}>
              {t(language, 'Select all', 'تحديد الكل')}
            </button>
            <button type="button" onClick={onClear} disabled={selected.size === 0}>
              {t(language, 'Clear', 'مسح')}
            </button>
            <span className="si-qdash-field-dropdown__count" dir="ltr">
              {filtered.length}/{fields.length}
            </span>
          </div>

          <div className="si-qdash-field-dropdown__list">
            {filtered.length ? (
              filtered.map(f => {
                const checked = selected.has(f.key);
                return (
                  <label
                    key={f.key}
                    className={
                      'si-qdash-field-dropdown__row' + (checked ? ' si-qdash-field-dropdown__row--on' : '')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(f.key)}
                      aria-label={f.label}
                    />
                    <span className="si-qdash-field-dropdown__name">{f.label}</span>
                    <span className="si-qdash-field-kind">{f.kind}</span>
                    {f.suggestedChart ? (
                      <span className="si-qdash-field-viz">{chartKindLabel(f.suggestedChart, language)}</span>
                    ) : null}
                  </label>
                );
              })
            ) : (
              <p className="si-qdash-field-dropdown__empty">
                {t(language, 'No fields match your search.', 'لا توجد حقول مطابقة.')}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
