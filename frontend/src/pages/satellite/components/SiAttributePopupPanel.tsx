import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/i18n';
import type { SiPopupInspectPayload } from '../../../lib/siLayerPopupInspect';
import { SiGeoAiInspectPopupBody } from './SiGeoAiInspectPopupBody';
import {
  buildAttributePopupSummary,
  filterAttributeRowsByQuery,
  filterNonemptyAttributeRows,
  parseAttributeNumericValue,
  sliceVirtualAttributeRows,
  type SiAttributePopupRow,
} from '../utils/siAttributePopupAnalytics';
import {
  classifySiMapFeatureFieldKind,
  copyTextToClipboard,
  formatSiMapFeaturePopupValue,
  siMapFeaturePopupFieldIcon,
} from '../utils/siMapFeaturePopupUtils';
import './SiAttributePopupPanel.css';

export type SiAttributePopupPanelProps = {
  rows: SiAttributePopupRow[];
  inspect?: SiPopupInspectPayload | null;
  editMode?: boolean;
  /** `arcgis` — simple field/value table (Esri popup style). `glass` — compact lux glass table. */
  layout?: 'rich' | 'arcgis' | 'glass';
  onEditSave?: (updates: Record<string, string>) => void;
  onEditCancel?: () => void;
  onZoomTo?: () => void;
  onCopyAll?: () => void;
  onExportCsv?: () => void;
};

type PanelTab = 'overview' | 'attributes' | 'relations' | 'media' | 'analysis';

const VIRTUAL_ROW_H = 44;
const VIRTUAL_THRESHOLD = 80;

function t(lang: string | undefined, en: string, ar: string): string {
  return lang === 'ar' ? ar : en;
}

function NdviGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  const tone = pct >= 60 ? '#22c55e' : pct >= 35 ? '#fbbf24' : '#f87171';
  return (
    <div className="si-attr-popup__ndvi-gauge" role="img" aria-label={label}>
      <div
        className="si-attr-popup__ndvi-gauge__arc"
        style={{
          background: `conic-gradient(${tone} ${pct * 3.6}deg, rgba(255,255,255,0.08) 0)`,
        }}
      />
      <span className="si-attr-popup__ndvi-gauge__val" dir="ltr">
        {value <= 1 ? value.toFixed(2) : pct.toFixed(0)}
      </span>
    </div>
  );
}

function renderRichValue(value: string, kind: ReturnType<typeof classifySiMapFeatureFieldKind>) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—') {
    return <span className="si-attr-popup__value-text si-attr-popup__value-text--empty">—</span>;
  }
  if (kind === 'url' || kind === 'attachment') {
    return (
      <a className="si-attr-popup__link si-attr-popup__link--file" href={trimmed} target="_blank" rel="noopener noreferrer">
        <i className={`fa-solid ${kind === 'attachment' ? 'fa-paperclip' : 'fa-arrow-up-right-from-square'}`} aria-hidden />
        <span>{trimmed}</span>
      </a>
    );
  }
  if (kind === 'pdf') {
    return (
      <a className="si-attr-popup__link si-attr-popup__link--pdf" href={trimmed} target="_blank" rel="noopener noreferrer">
        <i className="fa-solid fa-file-pdf" aria-hidden />
        <span>{trimmed.split('/').pop() ?? trimmed}</span>
      </a>
    );
  }
  if (kind === 'image') {
    return (
      <div className="si-attr-popup__media">
        <a className="si-attr-popup__link" href={trimmed} target="_blank" rel="noopener noreferrer">
          {trimmed.split('/').pop() ?? trimmed}
        </a>
        <img className="si-attr-popup__thumb" src={trimmed} alt="" loading="lazy" />
      </div>
    );
  }
  if (kind === 'email') {
    return (
      <a className="si-attr-popup__link" href={`mailto:${trimmed}`}>
        {trimmed}
      </a>
    );
  }
  return <span className="si-attr-popup__value-text">{trimmed}</span>;
}

function NumericBarChart({ stats }: { stats: { label: string; value: number; display: string }[] }) {
  if (!stats.length) return null;
  const max = Math.max(...stats.map(s => Math.abs(s.value)), 1);
  return (
    <div className="si-attr-popup__chart" role="img" aria-label="Numeric field chart">
      {stats.slice(0, 6).map(s => (
        <div key={s.label} className="si-attr-popup__chart-row">
          <span className="si-attr-popup__chart-label" title={s.label}>
            {s.label}
          </span>
          <div className="si-attr-popup__chart-track">
            <div
              className="si-attr-popup__chart-bar"
              style={{ width: `${Math.max(4, (Math.abs(s.value) / max) * 100)}%` }}
            />
          </div>
          <span className="si-attr-popup__chart-value" dir="ltr">
            {s.display}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricPills({ rows, tone }: { rows: SiAttributePopupRow[]; tone: 'ndvi' | 'aoi' | 'spatial' }) {
  if (!rows.length) return null;
  return (
    <div className={`si-attr-popup__metrics si-attr-popup__metrics--${tone}`}>
      {rows.slice(0, 8).map((r, i) => {
        const num = parseAttributeNumericValue(r.value);
        const showGauge = tone === 'ndvi' && num != null;
        return (
          <div key={`${r.label}-${i}`} className="si-attr-popup__metric-pill">
            {showGauge ? <NdviGauge value={num} label={r.label} /> : null}
            <div className="si-attr-popup__metric-body">
              <span className="si-attr-popup__metric-k">{r.label}</span>
              <strong className="si-attr-popup__metric-v" dir="ltr">
                {r.value}
              </strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SiAttributePopupPanel({
  rows,
  inspect,
  editMode = false,
  layout = 'rich',
  onEditSave,
  onEditCancel,
  onZoomTo,
  onCopyAll,
  onExportCsv,
}: SiAttributePopupPanelProps) {
  const { direction, language } = useLanguage();
  const dir = direction;
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PanelTab>('overview');
  const [hideEmpty, setHideEmpty] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(320);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const baseRows = useMemo(() => {
    if (inspect?.flatRows?.length) {
      return inspect.flatRows.map(r => ({ key: r.label, label: r.label, value: r.value }));
    }
    return rows.map(r => ({ key: r.key ?? r.label, label: r.label, value: r.value }));
  }, [inspect?.flatRows, rows]);

  const visibleBaseRows = useMemo(
    () => (hideEmpty ? filterNonemptyAttributeRows(baseRows) : baseRows),
    [baseRows, hideEmpty],
  );
  const summary = useMemo(() => buildAttributePopupSummary(baseRows), [baseRows]);

  const relationRows = useMemo(() => {
    const rel = inspect?.relationRows?.length
      ? inspect.relationRows.map(r => ({ key: r.key, label: r.label, value: r.value }))
      : summary.relationFields;
    return filterAttributeRowsByQuery(hideEmpty ? filterNonemptyAttributeRows(rel) : rel, query);
  }, [inspect?.relationRows, summary.relationFields, query, hideEmpty]);

  const mediaRows = useMemo(() => {
    const med = inspect?.mediaRows?.length
      ? inspect.mediaRows.map(r => ({ key: r.key, label: r.label, value: r.value }))
      : summary.mediaFields;
    return filterAttributeRowsByQuery(hideEmpty ? filterNonemptyAttributeRows(med) : med, query);
  }, [inspect?.mediaRows, summary.mediaFields, query, hideEmpty]);

  const attributeRows = useMemo(() => {
    const relationLabels = new Set(relationRows.map(r => r.label));
    const mediaLabels = new Set(mediaRows.map(r => r.label));
    const specialLabels = new Set([
      ...summary.ndviFields.map(r => r.label),
      ...summary.aoiFields.map(r => r.label),
      ...summary.spatialFields.map(r => r.label),
    ]);
    const core = visibleBaseRows.filter(
      r => !specialLabels.has(r.label) && !relationLabels.has(r.label) && !mediaLabels.has(r.label),
    );
    return filterAttributeRowsByQuery(core, query);
  }, [visibleBaseRows, summary, relationRows, mediaRows, query]);

  const analysisRows = useMemo(() => {
    const combined = [...summary.ndviFields, ...summary.aoiFields, ...summary.spatialFields];
    const list = hideEmpty ? filterNonemptyAttributeRows(combined) : combined;
    return filterAttributeRowsByQuery(list, query);
  }, [summary, query, hideEmpty]);

  const sections = useMemo(() => {
    if (inspect?.sections?.length && inspect.sections.some(s => s.rows.length > 0)) {
      return inspect.sections.map(sec => ({
        id: sec.id,
        title: sec.title,
        rows: filterAttributeRowsByQuery(
          hideEmpty
            ? filterNonemptyAttributeRows(sec.rows.map(r => ({ key: r.key, label: r.label, value: r.value })))
            : sec.rows.map(r => ({ key: r.key, label: r.label, value: r.value })),
          query,
        ),
      }));
    }
    return [{ id: 'all', title: t(language, 'Attributes', 'الحقول'), rows: attributeRows }];
  }, [inspect?.sections, attributeRows, query, hideEmpty, language]);

  const showRelationsTab = relationRows.length > 0 || (inspect?.relationRows?.length ?? 0) > 0;
  const showMediaTab = mediaRows.length > 0 || (inspect?.mediaRows?.length ?? 0) > 0;
  const showAnalysisTab =
    analysisRows.length > 0 || summary.ndviFields.length > 0 || summary.aoiFields.length > 0;

  const emptyHiddenCount = baseRows.length - filterNonemptyAttributeRows(baseRows).length;

  useEffect(() => {
    setQuery('');
    setTab('overview');
    setScrollTop(0);
  }, [baseRows]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 320));
    ro.observe(el);
    setViewportH(el.clientHeight || 320);
    return () => ro.disconnect();
  }, [tab]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  const handleCopyValue = useCallback((key: string, value: string) => {
    void copyTextToClipboard(value).then(ok => {
      if (!ok) return;
      setCopiedKey(key);
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1400);
    });
  }, []);

  const virtualSlice = useMemo(
    () => sliceVirtualAttributeRows(attributeRows, scrollTop, viewportH, VIRTUAL_ROW_H),
    [attributeRows, scrollTop, viewportH],
  );

  const renderAttributeRow = (r: SiAttributePopupRow, rk: string) => {
    const kind = classifySiMapFeatureFieldKind(r.label, r.value);
    const display = formatSiMapFeaturePopupValue(r.value, kind);
    const isEmpty = !display.trim() || display === '—';
    return (
      <div
        key={rk}
        className={'si-attr-popup__row' + (isEmpty ? ' si-attr-popup__row--empty' : '')}
      >
        <div className="si-attr-popup__field-label" title={r.label}>
          <i className={`fa-solid ${siMapFeaturePopupFieldIcon(kind)}`} aria-hidden />
          <span>{r.label}</span>
        </div>
        <div className="si-attr-popup__field-value">{renderRichValue(display, kind)}</div>
        <button
          type="button"
          className={'si-attr-popup__copy' + (copiedKey === rk ? ' si-attr-popup__copy--ok' : '')}
          title={t(language, 'Copy value', 'نسخ القيمة')}
          aria-label={`${t(language, 'Copy', 'نسخ')} ${r.label}`}
          onClick={() => handleCopyValue(rk, r.value)}
        >
          <i className={`fa-${copiedKey === rk ? 'solid fa-check' : 'regular fa-copy'}`} aria-hidden />
        </button>
      </div>
    );
  };

  const arcgisRows = useMemo(() => {
    const list = hideEmpty ? filterNonemptyAttributeRows(baseRows) : baseRows;
    return filterAttributeRowsByQuery(list, query);
  }, [baseRows, hideEmpty, query]);

  if ((layout === 'arcgis' || layout === 'glass') && !editMode) {
    const isGlass = layout === 'glass';
    return (
      <div
        className={'si-attr-popup' + (isGlass ? ' si-attr-popup--glass' : ' si-attr-popup--arcgis')}
        dir={dir}
      >
        <div className={isGlass ? 'si-attr-popup__glass-table' : 'si-attr-popup__arcgis-table'}>
          {arcgisRows.length ? (
            arcgisRows.map((r, i) => {
              const kind = classifySiMapFeatureFieldKind(r.label, r.value);
              const display = formatSiMapFeaturePopupValue(r.value, kind);
              const rowClass = isGlass
                ? 'si-attr-popup__glass-row' + (i % 2 === 0 ? ' si-attr-popup__glass-row--even' : '')
                : 'si-attr-popup__arcgis-row' + (i % 2 === 0 ? ' si-attr-popup__arcgis-row--even' : '');
              const kClass = isGlass ? 'si-attr-popup__glass-k' : 'si-attr-popup__arcgis-k';
              const vClass = isGlass ? 'si-attr-popup__glass-v' : 'si-attr-popup__arcgis-v';
              return (
                <div key={`${r.label}-${i}`} className={rowClass}>
                  <div className={kClass} title={r.label}>
                    {r.label}
                  </div>
                  <div className={vClass}>{renderRichValue(display, kind)}</div>
                </div>
              );
            })
          ) : (
            <p className="si-attr-popup__empty">
              {t(language, 'No attribute data available.', 'لا توجد بيانات وصفية.')}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (editMode) {
    return (
      <div className="si-attr-popup" dir={dir}>
        <SiGeoAiInspectPopupBody
          rows={rows}
          inspect={inspect}
          layout={inspect?.viewMode}
          variant="explore"
          editMode
          onEditSave={onEditSave}
          onEditCancel={onEditCancel}
        />
      </div>
    );
  }

  const tabs: { id: PanelTab; label: string; badge?: number }[] = [
    { id: 'overview', label: t(language, 'Overview', 'نظرة عامة') },
    {
      id: 'attributes',
      label: t(language, 'Attributes', 'الحقول'),
      badge: attributeRows.length,
    },
  ];
  if (showAnalysisTab) {
    tabs.push({
      id: 'analysis',
      label: t(language, 'Analysis', 'تحليل'),
      badge: analysisRows.length,
    });
  }
  if (showRelationsTab) {
    tabs.push({
      id: 'relations',
      label: t(language, 'Related', 'مرتبطة'),
      badge: relationRows.length,
    });
  }
  if (showMediaTab) {
    tabs.push({
      id: 'media',
      label: t(language, 'Media', 'وسائط'),
      badge: mediaRows.length,
    });
  }

  const hasQuickActions = onZoomTo || onCopyAll || onExportCsv;

  return (
    <div className="si-attr-popup" dir={dir} data-tab={tab}>
      <div className="si-attr-popup__toolbar">
        <div className="si-attr-popup__stats-strip" aria-live="polite">
          <span className="si-attr-popup__stat">
            <i className="fa-solid fa-list" aria-hidden />
            {summary.totalFields}
          </span>
          {summary.numericFields.length > 0 ? (
            <span className="si-attr-popup__stat">
              <i className="fa-solid fa-hashtag" aria-hidden />
              {summary.numericFields.length}
            </span>
          ) : null}
          {summary.ndviFields.length > 0 ? (
            <span className="si-attr-popup__stat si-attr-popup__stat--ndvi">
              <i className="fa-solid fa-leaf" aria-hidden />
              NDVI
            </span>
          ) : null}
          {summary.aoiFields.length > 0 ? (
            <span className="si-attr-popup__stat si-attr-popup__stat--aoi">
              <i className="fa-solid fa-draw-polygon" aria-hidden />
              AOI
            </span>
          ) : null}
        </div>
        <div className="si-attr-popup__toolbar-row">
          <input
            type="search"
            className="si-attr-popup__search"
            placeholder={t(language, 'Search fields…', 'بحث في الحقول…')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label={t(language, 'Search attribute fields', 'بحث في الحقول')}
          />
          {emptyHiddenCount > 0 ? (
            <button
              type="button"
              className={'si-attr-popup__toggle-empty' + (hideEmpty ? ' si-attr-popup__toggle-empty--on' : '')}
              aria-pressed={hideEmpty}
              title={
                hideEmpty
                  ? t(language, `${emptyHiddenCount} empty fields hidden`, `${emptyHiddenCount} حقول فارغة مخفية`)
                  : t(language, 'Showing empty fields', 'عرض الحقول الفارغة')
              }
              onClick={() => setHideEmpty(v => !v)}
            >
              <i className="fa-solid fa-eye-slash" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="si-attr-popup__tabs" role="tablist">
        {tabs.map(tb => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            className={'si-attr-popup__tab' + (tab === tb.id ? ' si-attr-popup__tab--on' : '')}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
            {tb.badge != null && tb.badge > 0 ? (
              <span className="si-attr-popup__tab-badge">{tb.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="si-attr-popup__scroll" onScroll={onScroll}>
        {tab === 'overview' ? (
          <div className="si-attr-popup__overview">
            <NumericBarChart stats={summary.numericFields} />
            {summary.ndviFields.length > 0 ? (
              <section className="si-attr-popup__section">
                <h4 className="si-attr-popup__section-title">
                  <i className="fa-solid fa-leaf" aria-hidden />
                  {t(language, 'NDVI indicators', 'مؤشرات NDVI')}
                </h4>
                <MetricPills rows={summary.ndviFields} tone="ndvi" />
              </section>
            ) : null}
            {summary.aoiFields.length > 0 ? (
              <section className="si-attr-popup__section">
                <h4 className="si-attr-popup__section-title">
                  <i className="fa-solid fa-draw-polygon" aria-hidden />
                  {t(language, 'AOI metrics', 'مؤشرات AOI')}
                </h4>
                <MetricPills rows={summary.aoiFields} tone="aoi" />
              </section>
            ) : null}
            {summary.spatialFields.length > 0 ? (
              <section className="si-attr-popup__section">
                <h4 className="si-attr-popup__section-title">
                  <i className="fa-solid fa-vector-square" aria-hidden />
                  {t(language, 'Spatial analysis', 'تحليل مكاني')}
                </h4>
                <MetricPills rows={summary.spatialFields} tone="spatial" />
              </section>
            ) : null}
            {sections[0]?.rows.slice(0, 8).map((r, i) => renderAttributeRow(r, `ov-${i}`))}
            {visibleBaseRows.length === 0 ? (
              <p className="si-attr-popup__empty">
                {t(language, 'No attribute data available.', 'لا توجد بيانات وصفية.')}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'attributes' ? (
          <div className="si-attr-popup__attrs">
            {inspect?.sections?.length && inspect.sections.some(s => s.rows.length > 0) ? (
              sections.map(sec =>
                sec.rows.length === 0 ? null : (
                  <section key={sec.id} className="si-attr-popup__section">
                    <h4 className="si-attr-popup__section-title">{sec.title}</h4>
                    {sec.rows.map((r, i) => renderAttributeRow(r, `${sec.id}-${i}`))}
                  </section>
                ),
              )
            ) : attributeRows.length > VIRTUAL_THRESHOLD ? (
              <div className="si-attr-popup__virtual" style={{ height: virtualSlice.totalHeight }}>
                <div className="si-attr-popup__virtual-inner" style={{ transform: `translateY(${virtualSlice.offsetY}px)` }}>
                  {virtualSlice.visible.map((r, i) =>
                    renderAttributeRow(r, `v-${virtualSlice.startIndex + i}`),
                  )}
                </div>
              </div>
            ) : attributeRows.length ? (
              attributeRows.map((r, i) => renderAttributeRow(r, `a-${i}`))
            ) : (
              <p className="si-attr-popup__empty">
                {t(language, 'No matching fields.', 'لا توجد حقول مطابقة.')}
              </p>
            )}
          </div>
        ) : null}

        {tab === 'analysis' ? (
          <div className="si-attr-popup__analysis">
            <MetricPills rows={summary.ndviFields} tone="ndvi" />
            <MetricPills rows={summary.aoiFields} tone="aoi" />
            <MetricPills rows={summary.spatialFields} tone="spatial" />
            {analysisRows.map((r, i) => renderAttributeRow(r, `an-${i}`))}
            {!analysisRows.length ? (
              <p className="si-attr-popup__empty">
                {t(language, 'No spatial analysis results.', 'لا توجد نتائج تحليل.')}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'relations' ? (
          <div className="si-attr-popup__relations">
            {relationRows.length ? (
              relationRows.map((r, i) => renderAttributeRow(r, `rel-${i}`))
            ) : (
              <p className="si-attr-popup__empty">
                {t(language, 'No related table fields.', 'لا توجد جداول مرتبطة.')}
              </p>
            )}
          </div>
        ) : null}

        {tab === 'media' ? (
          <div className="si-attr-popup__media-tab">
            {mediaRows.length ? (
              mediaRows.map((r, i) => renderAttributeRow(r, `med-${i}`))
            ) : (
              <p className="si-attr-popup__empty">
                {t(language, 'No media or attachments.', 'لا توجد وسائط أو مرفقات.')}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {hasQuickActions ? (
        <div className="si-attr-popup__actions" role="toolbar" aria-label={t(language, 'Quick actions', 'إجراءات سريعة')}>
          {onZoomTo ? (
            <button type="button" className="si-attr-popup__action" onClick={onZoomTo}>
              <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
              {t(language, 'Zoom', 'تكبير')}
            </button>
          ) : null}
          {onCopyAll ? (
            <button type="button" className="si-attr-popup__action" onClick={onCopyAll}>
              <i className="fa-solid fa-copy" aria-hidden />
              {t(language, 'Copy all', 'نسخ الكل')}
            </button>
          ) : null}
          {onExportCsv ? (
            <button type="button" className="si-attr-popup__action" onClick={onExportCsv}>
              <i className="fa-solid fa-file-csv" aria-hidden />
              CSV
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
