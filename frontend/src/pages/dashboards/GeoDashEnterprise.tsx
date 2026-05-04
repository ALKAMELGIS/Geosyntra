import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import GeoDashMapPanel from './GeoDashMapPanel'

type GeoTab = 'overview' | 'map' | 'reports' | 'sources'

type Kpi = {
  id: string
  label: string
  value: string
  deltaPct: number
  icon: string
}

const KPI_DEFAULTS: Kpi[] = [
  { id: 'harvest', label: 'Total harvest (kg)', value: '128,420', deltaPct: 4.2, icon: 'fa-solid fa-chart-line' },
  { id: 'fields', label: 'Active fields', value: '186', deltaPct: -0.8, icon: 'fa-solid fa-border-all' },
  { id: 'yield', label: 'Avg yield / field', value: '690 kg', deltaPct: 2.1, icon: 'fa-solid fa-gauge-high' },
  { id: 'sources', label: 'Data sources', value: '14', deltaPct: 12.5, icon: 'fa-solid fa-wand-magic-sparkles' },
]

type SourceRow = { id: string; name: string; kind: string; status: 'queued' | 'ready' | 'error'; at: string }

const GEODASH_API = (import.meta.env.VITE_GEODASH_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export default function GeoDashEnterprise() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [tab, setTab] = useState<GeoTab>('overview')
  const [dataset, setDataset] = useState('all')
  const [sources, setSources] = useState<SourceRow[]>([])
  const [spatialTool, setSpatialTool] = useState<'measure' | 'buffer' | 'monitor' | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  const navItems = useMemo(
    () =>
      [
        { id: 'overview' as const, label: 'Overview', icon: 'fa-solid fa-gauge-high' },
        { id: 'map' as const, label: 'Map view', icon: 'fa-solid fa-map' },
        { id: 'reports' as const, label: 'Reports', icon: 'fa-solid fa-file-lines' },
        { id: 'sources' as const, label: 'Sources', icon: 'fa-solid fa-database' },
      ] as const,
    [],
  )

  const onPickFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return
      setUploadBusy(true)
      setUploadMsg('')
      const next: SourceRow[] = []
      for (const f of Array.from(list)) {
        const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`
        const lower = f.name.toLowerCase()
        const kind =
          lower.endsWith('.csv') ? 'CSV' :
          lower.endsWith('.xlsx') || lower.endsWith('.xls') ? 'Excel' :
          lower.endsWith('.zip') || lower.endsWith('.shp') ? 'Shapefile' :
          lower.endsWith('.kml') || lower.endsWith('.kmz') ? 'KML/KMZ' :
          lower.endsWith('.geojson') || lower.endsWith('.json') ? 'GeoJSON' :
          'File'
        if (GEODASH_API) {
          try {
            const fd = new FormData()
            fd.append('file', f)
            const res = await fetch(`${GEODASH_API}/sources/upload`, { method: 'POST', body: fd })
            if (!res.ok) throw new Error(await res.text())
            next.push({ id, name: f.name, kind, status: 'ready', at: new Date().toISOString() })
          } catch {
            next.push({ id, name: f.name, kind, status: 'error', at: new Date().toISOString() })
          }
        } else {
          next.push({ id, name: f.name, kind, status: 'queued', at: new Date().toISOString() })
        }
      }
      setSources(prev => [...next, ...prev])
      setUploadBusy(false)
      setUploadMsg(
        GEODASH_API ? 'Uploads sent to GeoDash API.' : 'Files queued locally — set VITE_GEODASH_API_URL to reach FastAPI ingestion.',
      )
    },
    [],
  )

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside
        className={`flex shrink-0 flex-col border-r border-white/10 bg-slate-950/80 backdrop-blur-xl transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? 'w-[68px]' : 'w-56'
        }`}
        aria-label="Primary navigation"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <i className="fa-solid fa-chart-pie" aria-hidden />
          </span>
          {!sidebarCollapsed ? (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight text-white">GeoDash</div>
              <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">Enterprise</div>
            </div>
          ) : null}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              title={item.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                tab === item.id ? 'bg-white/12 text-white shadow-inner' : 'text-slate-400 hover:bg-white/6 hover:text-slate-200'
              }`}
            >
              <i className={`${item.icon} w-5 shrink-0 text-center text-emerald-400`} aria-hidden />
              {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-2">
          <Link
            to="/satellite/gis"
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-white/6 hover:text-slate-200 ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="Full GIS workspace"
          >
            <i className="fa-solid fa-map-location-dot w-5 shrink-0 text-center" aria-hidden />
            {!sidebarCollapsed ? <span className="truncate">GIS workspace</span> : null}
          </Link>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-white/5 hover:text-slate-300"
            onClick={() => setSidebarCollapsed(c => !c)}
            aria-expanded={!sidebarCollapsed}
          >
            <i className={`fa-solid ${sidebarCollapsed ? 'fa-angles-right' : 'fa-angles-left'} w-5`} aria-hidden />
            {!sidebarCollapsed ? <span>Collapse</span> : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-lg font-bold text-white md:text-xl">
              {tab === 'overview' ? 'Overview' : tab === 'map' ? 'Map view' : tab === 'reports' ? 'Reports' : 'Sources'}
            </h1>
            <div className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
              <i className="fa-solid fa-layer-group text-emerald-400" aria-hidden />
              <span>Layers & fields</span>
              <span className="text-slate-500">·</span>
              <span className="tabular-nums text-slate-400">demo</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="gd-dataset">
              Dataset
            </label>
            <select
              id="gd-dataset"
              value={dataset}
              onChange={e => setDataset(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none ring-emerald-500/40 focus:ring-2"
            >
              <option value="all">All datasets</option>
              <option value="2024">Season 2024</option>
              <option value="2023">Season 2023</option>
            </select>
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500"
              onClick={() => setTab('sources')}
            >
              + Add source
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-slate-950/50 px-4 py-2 text-xs text-slate-400">
          <span className="font-medium text-slate-500">Filters & export</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-semibold hover:bg-white/10">
              Export
            </button>
            <button type="button" className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 font-semibold text-emerald-200 hover:bg-emerald-500/25">
              Save view
            </button>
          </div>
        </div>

        <main className="relative flex-1 overflow-auto p-4 md:p-6">
          {/* Floating spatial tools */}
          <div
            className="pointer-events-none fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 md:bottom-8"
            role="toolbar"
            aria-label="Spatial analysis tools"
          >
            <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/15 bg-slate-950/80 p-1.5 shadow-glass backdrop-blur-md">
              {(
                [
                  { id: 'measure' as const, icon: 'fa-solid fa-ruler-combined', label: 'Area / distance' },
                  { id: 'buffer' as const, icon: 'fa-solid fa-circle-notch', label: 'Buffer analysis' },
                  { id: 'monitor' as const, icon: 'fa-solid fa-leaf', label: 'Field monitoring' },
                ] as const
              ).map(t => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  aria-pressed={spatialTool === t.id}
                  onClick={() => setSpatialTool(spatialTool === t.id ? null : t.id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm transition-colors ${
                    spatialTool === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <i className={t.icon} aria-hidden />
                </button>
              ))}
            </div>
          </div>

          {tab === 'overview' ? (
            <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {KPI_DEFAULTS.map(k => (
                  <article
                    key={k.id}
                    className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4 shadow-glass backdrop-blur-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                        <i className={k.icon} aria-hidden />
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                          k.deltaPct >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        <i className={`fa-solid ${k.deltaPct >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-[10px]`} aria-hidden />
                        {k.deltaPct >= 0 ? '+' : ''}
                        {k.deltaPct}%
                      </span>
                    </div>
                    <div className="mt-3 text-2xl font-black tabular-nums tracking-tight text-white">{k.value}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
                    <div className="mt-3 h-8 w-full rounded-md bg-white/5">
                      <div className="h-full w-[62%] rounded-md bg-gradient-to-r from-emerald-500/40 to-emerald-400/10" />
                    </div>
                  </article>
                ))}
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">Season trend</h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Interactive BI</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Cross-filter charts with map selection and field drill-down will bind to your FastAPI datasets (
                    <code className="rounded bg-black/30 px-1">/datasets</code>,{' '}
                    <code className="rounded bg-black/30 px-1">/records</code>). Wire Chart.js or Observable Plot here.
                  </p>
                  <div className="mt-4 grid h-48 place-items-center rounded-xl border border-dashed border-white/10 bg-slate-900/50 text-sm text-slate-500">
                    Chart canvas placeholder — connect fields below
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                  <h2 className="text-sm font-bold text-white">Distribution</h2>
                  <div className="mt-4 grid h-48 place-items-center rounded-xl border border-dashed border-white/10 bg-slate-900/50 text-sm text-slate-500">
                    Histogram / class breaks
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                  <h2 className="text-sm font-bold text-white">Top fields</h2>
                  <p className="mt-1 text-xs text-slate-500">By output volume · live from API when configured</p>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full min-w-[320px] text-left text-xs">
                      <thead className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Field</th>
                          <th className="px-3 py-2">Kg</th>
                          <th className="px-3 py-2">Progress</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        <tr className="border-b border-white/5">
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                            No rows yet — ingest spatial + tabular sources.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                  <h2 className="text-sm font-bold text-white">Recent activity</h2>
                  <ul className="mt-3 space-y-2 text-xs text-slate-400">
                    <li className="flex gap-2 rounded-lg bg-white/5 px-3 py-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                      <span>No activity yet — API audit stream can post here.</span>
                    </li>
                  </ul>
                </div>
              </section>
            </div>
          ) : null}

          {tab === 'map' ? (
            <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
              <p className="text-sm text-slate-400">
                High-contrast 2D cartographic preview (Mapbox GL). Multi-layer toggles for satellite, logistics corridors,
                and NDVI-style overlays. For full editing and export, open the{' '}
                <Link to="/satellite/gis" className="font-semibold text-emerald-400 underline-offset-2 hover:underline">
                  GIS Map
                </Link>
                .
              </p>
              <GeoDashMapPanel />
            </div>
          ) : null}

          {tab === 'reports' ? (
            <div className="mx-auto max-w-[720px] rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
              <h2 className="text-lg font-bold text-white">Executive cartographic export</h2>
              <p className="mt-2 text-sm text-slate-400">
                Generate print-ready layouts (A3 / slide) from the GIS map: legend, scale bar, north arrow, and branding.
                Backend can render static maps (Mapbox Static Images or headless GL) — pipeline stub lives in FastAPI README.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/satellite/gis"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  <i className="fa-solid fa-print" aria-hidden />
                  Open GIS for print / PDF
                </Link>
                <button
                  type="button"
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Download report template
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'sources' ? (
            <div className="mx-auto flex max-w-[900px] flex-col gap-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
                <h2 className="text-lg font-bold text-white">Ingest spatial & tabular data</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Excel, CSV, GeoJSON, KML/KMZ, and Shapefile (zip). FastAPI service stores datasets and links geometries to
                  many telemetry rows (one-to-many). Set <code className="rounded bg-black/30 px-1">VITE_GEODASH_API_URL</code>{' '}
                  to your API origin.
                </p>
                <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 px-6 py-12 text-center transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/10">
                  <i className="fa-solid fa-cloud-arrow-up mb-2 text-2xl text-emerald-400" aria-hidden />
                  <span className="text-sm font-bold text-white">Drop files or click to upload</span>
                  <span className="mt-1 text-xs text-slate-500">.csv · .xlsx · .geojson · .kml · .kmz · .zip (shp)</span>
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".csv,.tsv,.xlsx,.xls,.geojson,.json,.kml,.kmz,.zip"
                    disabled={uploadBusy}
                    onChange={e => void onPickFiles(e.target.files)}
                  />
                </label>
                {uploadMsg ? <p className="mt-3 text-xs text-slate-400">{uploadMsg}</p> : null}
              </div>
              {sources.length ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
                  <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-white">Ingestion queue</div>
                  <ul className="divide-y divide-white/5">
                    {sources.map(s => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-200">{s.name}</div>
                          <div className="text-slate-500">
                            {s.kind} · {new Date(s.at).toLocaleString()}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            s.status === 'ready' ? 'bg-emerald-500/20 text-emerald-300' :
                            s.status === 'error' ? 'bg-rose-500/20 text-rose-300' :
                            'bg-amber-500/20 text-amber-200'
                          }`}
                        >
                          {s.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
