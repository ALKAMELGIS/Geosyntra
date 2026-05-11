import { useEffect, useMemo, useState } from 'react';
import type { SiPopupInspectPayload } from '../../../lib/siLayerPopupInspect';
import './SiGeoAiInspectPopupBody.css';

export type SiGeoAiInspectPopupBodyProps = {
  rows: { label: string; value: string }[];
  inspect?: SiPopupInspectPayload | null;
  /** Layout density from layer config (table / card / compact). */
  layout?: 'table' | 'card' | 'compact';
};

type TabKey = 'attributes' | 'relations' | 'media';

function filterRows<T extends { label: string; value: string }>(rows: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(r => r.label.toLowerCase().includes(s) || r.value.toLowerCase().includes(s))
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {
      /* ignore */
    }
  }
}

export function SiGeoAiInspectPopupBody({ rows, inspect, layout = 'table' }: SiGeoAiInspectPopupBodyProps) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<TabKey>('attributes')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const presentation = inspect?.presentation ?? 'compact'
  const view = inspect?.viewMode ?? layout
  const relCount = inspect?.relationRows?.length ?? 0
  const medCount = inspect?.mediaRows?.length ?? 0
  const showTabs = presentation === 'tabbed' || presentation === 'relationship' || relCount + medCount > 1

  useEffect(() => {
    if (presentation === 'relationship' && relCount > 0) setTab('relations')
    else setTab('attributes')
  }, [presentation, relCount])

  const legacySections = useMemo(
    () => [{ id: 'all', title: 'Attributes', rows: rows.map(r => ({ key: r.label, label: r.label, value: r.value })) }],
    [rows],
  )
  const sections = inspect?.sections?.length ? inspect.sections : legacySections

  const filteredSections = useMemo(() => {
    return sections.map(sec => ({
      ...sec,
      rows: filterRows(sec.rows, q),
    }))
  }, [sections, q])

  const rel = useMemo(() => filterRows(inspect?.relationRows ?? [], q), [inspect?.relationRows, q])
  const med = useMemo(() => filterRows(inspect?.mediaRows ?? [], q), [inspect?.mediaRows, q])

  const rootClass = [
    'si-geo-ai-inspect-explore',
    view === 'card' ? 'si-geo-ai-inspect-explore--card' : '',
    view === 'compact' ? 'si-geo-ai-inspect-explore--compact' : '',
    presentation === 'compact' ? 'si-geo-ai-inspect-explore--dense' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const renderRow = (r: { key?: string; label: string; value: string }, rk: string) => (
    <div key={rk} className="si-geo-ai-inspect-explore-row">
      <div className="si-geo-ai-inspect-explore-k">{r.label}</div>
      <div className="si-geo-ai-inspect-explore-v" title={r.value}>
        {r.value}
      </div>
      <button
        type="button"
        className="si-geo-ai-inspect-explore-copy"
        title="Copy value"
        aria-label={`Copy ${r.label}`}
        onClick={() => void copyText(r.value)}
      >
        <i className="fa-regular fa-copy" aria-hidden />
      </button>
    </div>
  )

  const renderAttrBody = () => (
    <div className="si-geo-ai-inspect-explore-scroll">
      {filteredSections.map(sec => {
        const isCollapsed = collapsed[sec.id]
        return (
          <section key={sec.id} className="si-geo-ai-inspect-explore-section">
            <button
              type="button"
              className="si-geo-ai-inspect-explore-section-head"
              onClick={() => setCollapsed(c => ({ ...c, [sec.id]: !c[sec.id] }))}
              aria-expanded={!isCollapsed}
            >
              <span>{sec.title}</span>
              <span className="si-geo-ai-inspect-explore-section-meta">{sec.rows.length}</span>
              <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`} aria-hidden />
            </button>
            {!isCollapsed ? (
              <div className="si-geo-ai-inspect-explore-section-body">{sec.rows.map((r, i) => renderRow(r, `${sec.id}-${r.key}-${i}`))}</div>
            ) : null}
          </section>
        )
      })}
    </div>
  )

  return (
    <div className={rootClass}>
      <div className="si-geo-ai-inspect-explore-toolbar">
        <input
          type="search"
          className="si-geo-ai-inspect-explore-search"
          placeholder="Search attributes…"
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="Search attributes"
        />
      </div>
      {showTabs ? (
        <div className="si-geo-ai-inspect-explore-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'attributes'}
            className={tab === 'attributes' ? 'si-geo-ai-inspect-explore-tab si-geo-ai-inspect-explore-tab--on' : 'si-geo-ai-inspect-explore-tab'}
            onClick={() => setTab('attributes')}
          >
            Attributes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'relations'}
            className={tab === 'relations' ? 'si-geo-ai-inspect-explore-tab si-geo-ai-inspect-explore-tab--on' : 'si-geo-ai-inspect-explore-tab'}
            onClick={() => setTab('relations')}
          >
            Relations
            {relCount > 0 ? <span className="si-geo-ai-inspect-explore-badge">{relCount}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'media'}
            className={tab === 'media' ? 'si-geo-ai-inspect-explore-tab si-geo-ai-inspect-explore-tab--on' : 'si-geo-ai-inspect-explore-tab'}
            onClick={() => setTab('media')}
          >
            Media
            {medCount > 0 ? <span className="si-geo-ai-inspect-explore-badge">{medCount}</span> : null}
          </button>
        </div>
      ) : null}
      {!showTabs || tab === 'attributes' ? renderAttrBody() : null}
      {showTabs && tab === 'relations' ? (
        <div className="si-geo-ai-inspect-explore-scroll">
          {rel.length ? rel.map((r, i) => renderRow(r, `rel-${r.key}-${i}`)) : <p className="si-geo-ai-inspect-explore-empty">No relation fields detected.</p>}
        </div>
      ) : null}
      {showTabs && tab === 'media' ? (
        <div className="si-geo-ai-inspect-explore-scroll">
          {med.length ? med.map((r, i) => renderRow(r, `med-${r.key}-${i}`)) : <p className="si-geo-ai-inspect-explore-empty">No media / URL fields detected.</p>}
        </div>
      ) : null}
    </div>
  )
}
