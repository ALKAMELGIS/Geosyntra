import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
} from 'chart.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import * as XLSX from 'xlsx'
import type {
  GeoExplorerDataTablePayload,
  GeoExplorerDataTableRow,
  GeoExplorerMapLink,
} from '../../../lib/geoExplorerGemini'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export type GeoExplorerMapAction = 'zoom' | 'highlight' | 'focus'

export type GeoExplorerDynamicTableProps = {
  cssPrefix: string
  table: GeoExplorerDataTablePayload
  onMapAction?: (action: GeoExplorerMapAction, link: GeoExplorerMapLink) => void
}

const PAGE_OPTS = [10, 25, 50, 100] as const

function cellStr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function exportRows(payload: GeoExplorerDataTablePayload, rows: GeoExplorerDataTableRow[]) {
  const head = payload.columns.map(c => c.label)
  const body = rows.map(r => payload.columns.map(c => cellStr(r.values[c.key])))
  return { head, body }
}

export function GeoExplorerDynamicTable(props: GeoExplorerDynamicTableProps) {
  const { cssPrefix, table, onMapAction } = props
  const p = (part: string) => `${cssPrefix}-${part}`

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [chartOpen, setChartOpen] = useState(false)

  const hasMapCol = Boolean(onMapAction) && table.rows.some(r => r.mapLink)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return table.rows
    return table.rows.filter(row =>
      table.columns.some(c => cellStr(row.values[c.key]).toLowerCase().includes(q)),
    )
  }, [table.rows, table.columns, search])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      const va = a.values[sortKey]
      const vb = b.values[sortKey]
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return cellStr(va).localeCompare(cellStr(vb), undefined, { numeric: true }) * dir
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const onSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const { chartLabels, chartDataNums } = useMemo(() => {
    const labelCol = table.columns.find(c => c.align !== 'right') ?? table.columns[0]
    const numCol = table.columns.find(c => c.align === 'right')
    if (!labelCol || !numCol) return { chartLabels: [] as string[], chartDataNums: [] as number[] }
    const labels: string[] = []
    const nums: number[] = []
    for (const r of sorted.slice(0, 24)) {
      const lb = cellStr(r.values[labelCol.key]).slice(0, 32)
      const n = r.values[numCol.key]
      const nv = typeof n === 'number' ? n : Number(String(n).replace(/,/g, ''))
      if (!Number.isFinite(nv)) continue
      labels.push(lb || '—')
      nums.push(nv)
    }
    return { chartLabels: labels, chartDataNums: nums }
  }, [sorted, table.columns])

  const chartJsData: ChartData<'bar'> | null =
    chartOpen && chartLabels.length && chartDataNums.length
      ? {
          labels: chartLabels,
          datasets: [
            {
              label: table.columns.find(c => c.align === 'right')?.label ?? 'Value',
              data: chartDataNums,
              backgroundColor: 'rgba(167, 139, 250, 0.55)',
              borderColor: 'rgba(167, 139, 250, 1)',
              borderWidth: 1,
            },
          ],
        }
      : null

  const copyTsv = async () => {
    const { head, body } = exportRows(table, sorted)
    const tsv = [head.join('\t'), ...body.map(line => line.join('\t'))].join('\n')
    try {
      await navigator.clipboard.writeText(tsv)
    } catch {
      /* ignore */
    }
  }

  const downloadCsv = () => {
    const { head, body } = exportRows(table, sorted)
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lines = [head.map(esc).join(','), ...body.map(row => row.map(esc).join(','))]
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(table.title ?? 'geo-ai-table').replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const downloadXlsx = () => {
    const { head, body } = exportRows(table, sorted)
    const ws = XLSX.utils.aoa_to_sheet([head, ...body])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `${(table.title ?? 'geo-ai-table').replace(/\s+/g, '_')}.xlsx`)
  }

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    doc.setFontSize(11)
    doc.text(table.title ?? 'Geo AI table', 40, 36)
    doc.setFontSize(8)
    doc.text(`${table.kind} · ${sorted.length} rows`, 40, 52)
    const { head, body } = exportRows(table, sorted.slice(0, 500))
    autoTable(doc, {
      head: [head],
      body,
      startY: 64,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })
    doc.save(`${(table.title ?? 'geo-ai-table').replace(/\s+/g, '_')}.pdf`)
  }

  return (
    <div className={p('dyn-table')} role="region" aria-label={table.title ?? 'Data table'}>
      <div className={p('dyn-table-toolbar')}>
        <span className={p('dyn-table-badge')}>{table.kind}</span>
        {table.title ? <span className={p('dyn-table-title')}>{table.title}</span> : null}
        <span className={p('dyn-table-meta')}>
          {sorted.length}/{table.rows.length} rows
          {hasMapCol ? <span className={p('dyn-table-meta-hint')}> · Row = select+zoom</span> : null}
        </span>
      </div>
      <div className={p('dyn-table-controls')}>
        <label className={p('dyn-table-search')}>
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            aria-label="Search table"
            placeholder="Search…"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            autoComplete="off"
          />
        </label>
        <label className={p('dyn-table-pagesize')}>
          Rows
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value))
              setPage(0)
            }}
          >
            {PAGE_OPTS.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className={p('dyn-table-actions')}>
          <button type="button" className={p('dyn-table-btn')} onClick={copyTsv} title="Copy as TSV">
            <i className="fa-regular fa-copy" aria-hidden /> Copy
          </button>
          <button type="button" className={p('dyn-table-btn')} onClick={downloadCsv}>
            CSV
          </button>
          <button type="button" className={p('dyn-table-btn')} onClick={downloadXlsx}>
            Excel
          </button>
          <button type="button" className={p('dyn-table-btn')} onClick={downloadPdf}>
            PDF
          </button>
          <button
            type="button"
            className={`${p('dyn-table-btn')} ${chartOpen ? p('dyn-table-btn--active') : ''}`}
            onClick={() => setChartOpen(c => !c)}
            title="Quick bar chart from first label + numeric column"
          >
            <i className="fa-solid fa-chart-column" aria-hidden /> Chart
          </button>
        </div>
      </div>

      {chartJsData ? (
        <div className={p('dyn-table-chart')}>
          <Bar
            data={chartJsData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { maxRotation: 45, minRotation: 0 } },
              },
            }}
          />
        </div>
      ) : null}

      <div className={p('dyn-table-scroll')}>
        <table className={p('dyn-table-grid')} title={hasMapCol ? 'Click a row to select the feature and fly the map (GIS Map).' : undefined}>
          <thead>
            <tr>
              {table.columns.map(c => (
                <th key={c.key} className={c.align === 'right' ? p('dyn-table-th-numeric') : undefined}>
                  <button type="button" className={p('dyn-table-sort')} onClick={() => onSort(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
              {hasMapCol ? <th className={p('dyn-table-map-col')}>Map</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr
                key={`${safePage}-${ri}`}
                className={row.mapLink ? p('dyn-table-row--interactive') : undefined}
                onClick={ev => {
                  if (!row.mapLink || !onMapAction) return
                  if ((ev.target as HTMLElement).closest('button')) return
                  onMapAction('focus', row.mapLink)
                }}
              >
                {table.columns.map(c => (
                  <td key={c.key} className={c.align === 'right' ? p('dyn-table-td-numeric') : undefined}>
                    {cellStr(row.values[c.key]) || '—'}
                  </td>
                ))}
                {hasMapCol ? (
                  <td className={p('dyn-table-map-cell')}>
                    {row.mapLink ? (
                      <span className={p('dyn-table-map-btns')}>
                        <button
                          type="button"
                          className={p('dyn-table-icon-btn')}
                          title="Zoom to feature"
                          onClick={ev => {
                            ev.stopPropagation()
                            onMapAction?.('zoom', row.mapLink!)
                          }}
                        >
                          <i className="fa-solid fa-magnifying-glass-location" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={p('dyn-table-icon-btn')}
                          title="Highlight on map"
                          onClick={ev => {
                            ev.stopPropagation()
                            onMapAction?.('highlight', row.mapLink!)
                          }}
                        >
                          <i className="fa-solid fa-highlighter" aria-hidden />
                        </button>
                      </span>
                    ) : (
                      <span className={p('dyn-table-dash')}>—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.foot && Object.keys(table.foot).length ? (
        <div className={p('dyn-table-foot')}>
          {Object.entries(table.foot).map(([k, v]) => (
            <div key={k} className={p('dyn-table-foot-line')}>
              {k === 'Summary' ? cellStr(v) : (
                <>
                  <strong>{k}:</strong> {cellStr(v)}
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className={p('dyn-table-pagination')}>
        <button
          type="button"
          className={p('dyn-table-btn')}
          disabled={safePage <= 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
        >
          Prev
        </button>
        <span>
          Page {safePage + 1} / {pageCount}
        </span>
        <button
          type="button"
          className={p('dyn-table-btn')}
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}
