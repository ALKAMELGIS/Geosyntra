import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  arcgisExtentToWgs84BBox,
  fetchImageServerMeta,
  getImageServerServiceRootFromUrl,
} from '../../lib/arcgisImageServer'
import { getArcgisPortalToken } from '../../lib/arcgisPortalToken'
import { parseFile, parseRemoteUrlAsFile } from '../../utils/FileLoader'

export default function GisContent() {
  return <GisContentPage />
}

type AddLayerTab = 'arcgis' | 'upload' | 'url'

type FieldType = 'text' | 'number' | 'date' | 'boolean'

type FieldSchema = {
  id: string
  name: string
  type: FieldType
  length?: number
  defaultValue?: string
  nullable?: boolean
}

type RelationshipType = 'one-to-one' | 'one-to-many' | 'many-to-many'
type TableDomainDisplayMode = 'description' | 'code'
type TableSearchMode = 'description' | 'code' | 'both'
type TableFilterOperator = 'contains' | 'equals' | 'not_equals' | 'empty' | 'not_empty'

type Relationship = {
  id: string
  name: string
  type: RelationshipType
  originLayerId: string
  destinationLayerId: string
  originKey: string
  destinationKey: string
  enforce?: boolean
  cascadeDelete?: boolean
  junctionLayerId?: string
  originJunctionKey?: string
  destinationJunctionKey?: string
}

type LayerRow = {
  id: string
  name: string
  visible: boolean
  source?: string
  geometryType: string
  recordCount: number
  createdAt: string
}

type LayerData = {
  id: number | string
  name: string
  type: 'geojson' | 'wms' | 'tile' | 'image'
  source?: 'arcgis' | 'upload' | 'url'
  visible: boolean
  opacity: number
  data?: any
  url?: string
  authToken?: string
  arcgisLayerDefinition?: any
  bbox?: [number, number, number, number]
}

const DB_NAME = 'GisMapStore'
const STORE_NAME = 'layers'

const LS_META_KEY = 'gisContent.layerMeta.v1'
const LS_ORDER_KEY = 'gisContent.layerOrder.v1'
const LS_FIELDS_KEY = 'gisContent.layerFields.v1'
const LS_RELATIONSHIPS_KEY = 'gisContent.relationships.v1'
const LS_HIDDEN_FIELDS_KEY = 'gisContent.hiddenFields.v1'

const initDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'))
      return
    }
    let settled = false
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('IndexedDB initialization timed out.'))
    }, 1500)

    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve(req.result)
    }
    req.onerror = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      reject(req.error)
    }
  })

const saveLayersToDB = async (layers: LayerData[]) => {
  const db = await initDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(layers, 'savedLayers')
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const loadLayersFromDB = async (): Promise<LayerData[]> => {
  const db = await initDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const req = tx.objectStore(STORE_NAME).get('savedLayers')
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

const safeLocalStorageGetItem = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeLocalStorageSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
  }
}

const safeParseJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

const safeString = (v: any) => (v === null || v === undefined ? '' : String(v))

const newId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`

const normalizeName = (raw: string) => raw.trim().replace(/\s+/g, ' ')

const isValidFieldName = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)

const getGeoJsonFields = (data: any) => {
  const features = Array.isArray(data?.features) ? (data.features as any[]) : []
  const fields = new Set<string>()
  for (let i = 0; i < Math.min(features.length, 50); i += 1) {
    const props = features[i]?.properties
    if (!props || typeof props !== 'object') continue
    Object.keys(props).forEach(k => fields.add(k))
  }
  return Array.from(fields).sort((a, b) => a.localeCompare(b))
}

const getGeometryType = (layer: LayerData) => {
  if (layer.type === 'tile' && layer.data?.esriImageServer) return 'ImageServer'
  const arc = layer.source === 'arcgis' ? layer.arcgisLayerDefinition : null
  const fromArc = typeof arc?.geometryType === 'string' ? arc.geometryType : ''
  if (fromArc) return fromArc
  const features = Array.isArray(layer.data?.features) ? (layer.data.features as any[]) : []
  const g = features.find(f => f?.geometry?.type)?.geometry?.type
  return typeof g === 'string' ? g : '—'
}

const getRecordCount = (layer: LayerData) => {
  if (layer.type === 'tile' && layer.data?.esriImageServer) return 0
  const features = Array.isArray(layer.data?.features) ? (layer.data.features as any[]) : []
  return features.length
}

const mapArcFieldType = (arcType: string | undefined): FieldType => {
  const t = (arcType || '').toLowerCase()
  if (t.includes('date')) return 'date'
  if (t.includes('integer') || t.includes('double') || t.includes('single') || t.includes('smallinteger')) return 'number'
  if (t.includes('oid')) return 'number'
  if (t.includes('string') || t.includes('guid')) return 'text'
  return 'text'
}

const buildArcGisUrl = (baseUrl: string, params: Record<string, string>) => {
  const normalized = baseUrl.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const u = new URL(normalized, window.location.origin)
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '') search.set(k, v)
  })
  u.search = search.toString()
  return u.toString()
}

const normalizeArcGisServiceUrl = (raw: string) => {
  const trimmed = raw.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const parts = trimmed.split('/')
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
    return parts.slice(0, -1).join('/')
  }
  return trimmed
}

const discoverArcGisLayers = async (serviceUrl: string, token: string) => {
  const base = normalizeArcGisServiceUrl(serviceUrl)
  const url = buildArcGisUrl(base, { f: 'json', token: token.trim() })
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (json?.error?.message) {
    const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
    throw new Error([json.error.message, details].filter(Boolean).join(' '))
  }
  const layersArr = Array.isArray(json?.layers) ? json.layers : []
  const tablesArr = Array.isArray(json?.tables) ? json.tables : []
  const discovered = [...layersArr.map((l: any) => ({ ...l, kind: 'layer' as const })), ...tablesArr.map((t: any) => ({ ...t, kind: 'table' as const }))]
    .filter((l: any) => typeof l?.id === 'number' && typeof l?.name === 'string')
    .map((l: any) => ({
      id: l.id as number,
      name: l.name as string,
      kind: l.kind as 'layer' | 'table',
      url: `${base.replace(/\/+$/, '')}/${l.id}`,
      geometryType: typeof l?.geometryType === 'string' ? (l.geometryType as string) : undefined,
    }))
  if (discovered.length === 0) throw new Error('No layers/tables found at this URL.')
  return discovered
}

const fetchArcGisGeoJson = async (layerUrl: string, authToken?: string, opts?: { returnGeometry?: boolean }) => {
  const returnGeometry = opts?.returnGeometry !== false
  const url = buildArcGisUrl(`${layerUrl.replace(/\/+$/, '')}/query`, {
    where: '1=1',
    outFields: '*',
    returnGeometry: returnGeometry ? 'true' : 'false',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '2000',
    token: (authToken ?? '').trim(),
  })
  const res = await fetch(url, { method: 'GET' })
  const geojson = await res.json()
  if (geojson?.error?.message) {
    const details = Array.isArray(geojson?.error?.details) ? geojson.error.details.join(' ') : ''
    throw new Error([geojson.error.message, details].filter(Boolean).join(' '))
  }
  if (!geojson || geojson.type !== 'FeatureCollection') throw new Error('Service did not return valid GeoJSON.')
  return geojson
}

const fetchArcGisLayerDefinition = async (layerUrl: string, authToken?: string) => {
  const url = buildArcGisUrl(layerUrl.replace(/\/+$/, ''), { f: 'json', token: (authToken ?? '').trim() })
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (json?.error?.message) {
    const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
    throw new Error([json.error.message, details].filter(Boolean).join(' '))
  }
  return json
}

function RecordsPanel({
  layer,
  fields,
  hiddenFields,
  setHiddenFields,
}: {
  layer: LayerData
  fields: FieldSchema[]
  hiddenFields: string[]
  setHiddenFields: (next: string[]) => void
}) {
  const features = Array.isArray(layer.data?.features) ? (layer.data.features as any[]) : []
  const fieldsAll = useMemo(() => fields.map(f => f.name).filter(Boolean), [fields])
  const hidden = useMemo(() => new Set(hiddenFields), [hiddenFields])
  const fieldsVisible = useMemo(() => fieldsAll.filter(f => !hidden.has(f)), [fieldsAll, hidden])

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [query, setQuery] = useState('')
  const [fieldControlsOpen, setFieldControlsOpen] = useState(false)
  const [fieldControlQuery, setFieldControlQuery] = useState('')
  /** Domain / subtype coded values: always show descriptions (not raw codes). */
  const domainDisplayMode: TableDomainDisplayMode = 'description'
  const [searchMode, setSearchMode] = useState<TableSearchMode>('description')
  const [filterField, setFilterField] = useState('')
  const [filterOperator, setFilterOperator] = useState<TableFilterOperator>('contains')
  const [filterValue, setFilterValue] = useState('')

  const arcDef = layer.source === 'arcgis' ? layer.arcgisLayerDefinition : null
  const arcTypeIdField = typeof arcDef?.typeIdField === 'string' ? arcDef.typeIdField : ''
  const arcTypes = Array.isArray(arcDef?.types) ? arcDef.types : []
  const arcFieldsByLower = useMemo(() => {
    const map = new Map<string, any>()
    if (Array.isArray(arcDef?.fields)) {
      arcDef.fields.forEach((field: any) => {
        if (typeof field?.name === 'string') map.set(field.name.toLowerCase(), field)
      })
    }
    return map
  }, [arcDef])

  const getArcSubtype = (ft: any) => {
    if (!arcTypeIdField) return null
    const raw = ft?.properties?.[arcTypeIdField]
    return arcTypes.find((type: any) => String(type?.id) === String(raw)) || null
  }

  const getArcDomainForField = (ft: any, fieldName: string) => {
    if (!arcDef) return null
    const subtype = getArcSubtype(ft)
    const subtypeDomains = subtype && subtype.domains && typeof subtype.domains === 'object' ? subtype.domains : null
    const subtypeDomain = subtypeDomains ? subtypeDomains[fieldName] ?? subtypeDomains[String(fieldName)] : null
    if (subtypeDomain) return subtypeDomain
    const fieldDef = arcFieldsByLower.get(String(fieldName).toLowerCase())
    return fieldDef?.domain ?? null
  }

  const readCodedValueDescription = (coded: any) => {
    const candidates = [coded?.description, coded?.label, coded?.name, coded?.displayName]
    const found = candidates.find(v => typeof v === 'string' && v.trim())
    return typeof found === 'string' ? found.trim() : ''
  }

  const getArcDisplayValue = (ft: any, fieldName: string, raw: any) => {
    const rawText = raw === null || raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
    if (!arcDef) return { code: rawText, description: '', display: rawText, title: rawText, hasDomain: false, missingDescription: false }

    if (arcTypeIdField && String(fieldName).toLowerCase() === String(arcTypeIdField).toLowerCase()) {
      const subtype = getArcSubtype(ft)
      const label = typeof subtype?.name === 'string' && subtype.name ? subtype.name : typeof subtype?.description === 'string' ? subtype.description : ''
      const description = label.trim()
      const display = domainDisplayMode === 'description' && description ? description : rawText
      const title = description ? `${description} (code: ${rawText})` : rawText
      return { code: rawText, description, display, title, hasDomain: Boolean(subtype), missingDescription: Boolean(subtype && rawText && !description) }
    }

    const domain = getArcDomainForField(ft, fieldName)
    if (domain?.type === 'codedValue' && Array.isArray(domain?.codedValues)) {
      const coded = domain.codedValues.find((cv: any) => String(cv?.code) === rawText)
      const description = readCodedValueDescription(coded)
      const display = domainDisplayMode === 'description' && description ? description : rawText
      const title = description ? `${description} (code: ${rawText})` : rawText
      return { code: rawText, description, display, title, hasDomain: true, missingDescription: Boolean(rawText && !description) }
    }

    return { code: rawText, description: '', display: rawText, title: rawText, hasDomain: false, missingDescription: false }
  }

  /**
   * Subtype (typeIdField) and layer/subtype coded-value domains → drive a native &lt;select&gt; like ArcGIS Field Maps.
   * Table is view-only here; dropdown shows the canonical value list from the layer definition.
   */
  const buildArcDomainDropdown = (ft: any, fieldName: string) => {
    if (!arcDef) return null
    const fname = String(fieldName)
    const props = ft?.properties && typeof ft.properties === 'object' ? (ft.properties as Record<string, any>) : {}
    const raw = props[fname]
    const rawStr = raw === null || raw === undefined ? '' : String(raw)

    if (arcTypeIdField && fname.toLowerCase() === String(arcTypeIdField).toLowerCase()) {
      const mapped = arcTypes.map((t: any) => ({
        value: String(t?.id ?? ''),
        label:
          typeof t?.name === 'string' && t.name.trim()
            ? t.name.trim()
            : typeof t?.description === 'string' && t.description.trim()
              ? t.description.trim()
              : String(t?.id ?? ''),
      }))
      const seen = new Set<string>()
      const dedup = mapped.filter(o => {
        if (seen.has(o.value)) return false
        seen.add(o.value)
        return true
      })
      const options = [{ value: '', label: '<Null>' }, ...dedup]
      if (rawStr !== '' && !options.some(o => o.value === rawStr)) {
        options.push({ value: rawStr, label: rawStr })
      }
      return { options, rawStr }
    }

    const domain = getArcDomainForField(ft, fname)
    if (domain?.type === 'codedValue' && Array.isArray(domain.codedValues)) {
      const mapped = domain.codedValues.map((cv: any) => ({
        value: String(cv?.code ?? ''),
        label: readCodedValueDescription(cv) || String(cv?.code ?? ''),
      }))
      const seen = new Set<string>()
      const dedup = mapped.filter(o => {
        if (seen.has(o.value)) return false
        seen.add(o.value)
        return true
      })
      const options = [{ value: '', label: '<Null>' }, ...dedup]
      if (rawStr !== '' && !options.some(o => o.value === rawStr)) {
        options.push({ value: rawStr, label: rawStr })
      }
      return { options, rawStr }
    }

    return null
  }

  const getSearchText = (ft: any, fieldName: string, mode: TableSearchMode = searchMode) => {
    const value = getArcDisplayValue(ft, fieldName, ft?.properties?.[fieldName])
    if (mode === 'description') return value.description || value.display || value.code
    if (mode === 'code') return value.code
    return [value.description, value.code, value.display].filter(Boolean).join(' ')
  }

  const passesRuleFilter = (ft: any) => {
    if (!filterField) return true
    const haystack = getSearchText(ft, filterField, 'both').toLowerCase()
    const needle = filterValue.trim().toLowerCase()
    if (filterOperator === 'empty') return haystack.length === 0
    if (filterOperator === 'not_empty') return haystack.length > 0
    if (!needle) return true
    if (filterOperator === 'equals') return haystack === needle
    if (filterOperator === 'not_equals') return haystack !== needle
    return haystack.includes(needle)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ruleFiltered = features.filter(passesRuleFilter)
    if (!q) return ruleFiltered
    const maxScan = Math.min(features.length, 5000)
    const out: any[] = []
    for (let i = 0; i < Math.min(ruleFiltered.length, maxScan); i += 1) {
      const feature = ruleFiltered[i]
      const props = feature?.properties
      if (!props || typeof props !== 'object') continue
      const hay = fieldsVisible
        .slice(0, 20)
        .map(k => getSearchText(feature, k).toLowerCase())
        .join(' ')
      if (hay.includes(q)) out.push(feature)
    }
    return out
  }, [features, query, fieldsVisible, domainDisplayMode, searchMode, filterField, filterOperator, filterValue])

  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.max(0, Math.min(pages - 1, page))
  const start = safePage * pageSize
  const view = filtered.slice(start, start + pageSize)
  const fieldControlMatches = useMemo(() => {
    const q = fieldControlQuery.trim().toLowerCase()
    if (!q) return fieldsAll
    return fieldsAll.filter(f => f.toLowerCase().includes(q))
  }, [fieldControlQuery, fieldsAll])

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage])

  return (
    <div className="gis-content-panel">
      <div className="gis-content-panelbar">
        <div className="gis-content-paneltitle">Data Table</div>
        <div className="gis-content-panelactions">
          <div className="gis-content-selectwrap">
            <select className="gis-content-select" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[25, 50, 100, 200].map(n => (
                <option key={n} value={String(n)}>
                  {n} / page
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down" aria-hidden="true" />
          </div>
          <button
            className={fieldControlsOpen ? 'gis-btn gis-content-fields-toggle active' : 'gis-btn gis-content-fields-toggle'}
            type="button"
            onClick={() => setFieldControlsOpen(v => !v)}
            disabled={!fieldsAll.length}
            aria-expanded={fieldControlsOpen}
            aria-controls="gis-content-field-controls"
          >
            <i className="fa-solid fa-sliders" aria-hidden="true"></i>
            Fields {fieldsVisible.length}/{fieldsAll.length}
          </button>
        </div>
      </div>

      <div className="gis-content-table-controls" aria-label="Data table display, search, and filter controls">
        <div className="gis-content-record-count">Showing {total} of {features.length} feature(s)</div>
        <label className="gis-content-table-control">
          <span>Search mode</span>
          <select value={searchMode} onChange={(e) => setSearchMode(e.target.value as TableSearchMode)}>
            <option value="description">Description</option>
            <option value="code">Code</option>
            <option value="both">Description + Code</option>
          </select>
        </label>
        <label className="gis-content-table-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchMode === 'code' ? 'Search codes...' : 'Search descriptions...'} />
        </label>
        <label className="gis-content-table-control">
          <span>Filter field</span>
          <select value={filterField} onChange={(e) => setFilterField(e.target.value)}>
            <option value="">All records</option>
            {fieldsVisible.map(fieldName => (
              <option key={fieldName} value={fieldName}>{fieldName}</option>
            ))}
          </select>
        </label>
        <label className="gis-content-table-control">
          <span>Rule</span>
          <select value={filterOperator} onChange={(e) => setFilterOperator(e.target.value as TableFilterOperator)}>
            <option value="contains">Contains</option>
            <option value="equals">Equals</option>
            <option value="not_equals">Not equals</option>
            <option value="empty">Empty</option>
            <option value="not_empty">Not empty</option>
          </select>
        </label>
        <label className="gis-content-table-control gis-content-filter-value">
          <span>Value</span>
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder="Filter value"
            disabled={filterOperator === 'empty' || filterOperator === 'not_empty'}
          />
        </label>
        <button
          className="gis-btn gis-content-clear-filter"
          type="button"
          onClick={() => {
            setFilterField('')
            setFilterOperator('contains')
            setFilterValue('')
            setQuery('')
          }}
          disabled={!filterField && !filterValue && !query}
        >
          Clear filter
        </button>
      </div>

      {fieldControlsOpen ? (
        <div id="gis-content-field-controls" className="gis-content-fieldsdrawer" aria-label="Field controls">
          <div className="gis-content-fieldsdrawer-head">
            <div>
              <div className="gis-content-fieldsdrawer-title">Field Controls</div>
              <div className="gis-content-fieldsdrawer-subtitle">Choose which columns appear in the data table.</div>
            </div>
            <div className="gis-content-fieldsdrawer-actions">
              <button className="gis-btn" type="button" onClick={() => setHiddenFields([])} disabled={!hidden.size}>
                Show all
              </button>
              <button className="gis-btn" type="button" onClick={() => setHiddenFields(fieldsAll)} disabled={!fieldsAll.length || hidden.size === fieldsAll.length}>
                Hide all
              </button>
            </div>
          </div>

          <input
            className="gis-input gis-content-field-filter"
            value={fieldControlQuery}
            onChange={(e) => setFieldControlQuery(e.target.value)}
            placeholder="Search fields..."
            aria-label="Search table fields"
          />

          <div className="gis-content-fieldsgrid">
            {fieldControlMatches.length ? (
              fieldControlMatches.map((f) => {
                const on = !hidden.has(f)
                return (
                  <button
                    key={f}
                    type="button"
                    className={on ? 'gis-content-fielditem active' : 'gis-content-fielditem'}
                    aria-pressed={on}
                    onClick={() => {
                      const prev = new Set(hiddenFields)
                      if (on) prev.add(f)
                      else prev.delete(f)
                      setHiddenFields(Array.from(prev))
                    }}
                  >
                    <span className="gis-content-fielditem-check">
                      <i className={on ? 'fa-solid fa-check' : 'fa-solid fa-eye-slash'} aria-hidden="true"></i>
                    </span>
                    <span className="gis-content-fielditem-label">{f}</span>
                  </button>
                )
              })
            ) : (
              <div className="gis-content-muted">No matching fields.</div>
            )}
          </div>
        </div>
      ) : null}

      <div className="gis-content-fieldsbar" aria-label="Visible fields summary">
        {fieldsVisible.length ? (
          fieldsVisible.slice(0, 10).map((f) => (
            <span key={f} className="gis-content-chip active">
              {f}
            </span>
          ))
        ) : (
          <div className="gis-content-muted">No visible fields. Open Fields to choose columns.</div>
        )}
        {fieldsVisible.length > 10 ? (
          <span className="gis-content-chip gis-content-chip-more">+{fieldsVisible.length - 10} more</span>
        ) : null}
      </div>

      <div className="gis-content-tablewrap" role="region" aria-label="Tabular data">
        <table className="gis-content-table">
          <thead>
            <tr>
              {fieldsVisible.map(f => (
                <th key={f} title={f}>
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((ft, idx) => {
              const props = ft?.properties && typeof ft.properties === 'object' ? (ft.properties as Record<string, any>) : {}
              const rowKey = `${start + idx}`
              return (
                <tr key={rowKey}>
                  {fieldsVisible.map((f) => {
                    const out = getArcDisplayValue(ft, f, props[f])
                    const dropdown = buildArcDomainDropdown(ft, f)
                    if (dropdown) {
                      return (
                        <td key={`${rowKey}:${f}`} title={out.title}>
                          <span
                            className={
                              out.missingDescription && domainDisplayMode === 'description'
                                ? 'gis-domain-cell gis-domain-cell--dropdown missing-description'
                                : 'gis-domain-cell gis-domain-cell--dropdown'
                            }
                          >
                            {out.missingDescription && domainDisplayMode === 'description' ? (
                              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" title="No domain description found; code shown instead" />
                            ) : null}
                            <select
                              className="gis-domain-select"
                              value={dropdown.rawStr}
                              aria-label={f}
                              title={out.title}
                              onChange={() => {}}
                            >
                              {dropdown.options.map(o => (
                                <option key={`${o.value}\u0000${o.label}`} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </span>
                        </td>
                      )
                    }
                    return (
                      <td key={`${rowKey}:${f}`} title={out.title}>
                        <span className={out.missingDescription && domainDisplayMode === 'description' ? 'gis-domain-cell missing-description' : 'gis-domain-cell'}>
                          {out.missingDescription && domainDisplayMode === 'description' ? (
                            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" title="No domain description found; code shown instead" />
                          ) : null}
                          {out.display}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="gis-content-pagination" aria-label="Pagination">
        <div className="gis-content-muted">{total ? `${start + 1}-${Math.min(start + pageSize, total)} of ${total}` : '0'}</div>
        <div className="gis-content-pager">
          <button className="gis-btn" type="button" onClick={() => setPage(0)} disabled={safePage === 0}>
            First
          </button>
          <button className="gis-btn" type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>
            Prev
          </button>
          <div className="gis-content-pageinfo">
            Page {safePage + 1} / {pages}
          </div>
          <button className="gis-btn" type="button" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={safePage >= pages - 1}>
            Next
          </button>
          <button className="gis-btn" type="button" onClick={() => setPage(pages - 1)} disabled={safePage >= pages - 1}>
            Last
          </button>
        </div>
      </div>
    </div>
  )
}

function GisContentPage() {
  const [layers, setLayers] = useState<LayerData[]>([])
  const [layersLoaded, setLayersLoaded] = useState(false)
  const [layersLoadError, setLayersLoadError] = useState<string | null>(null)
  const persistLayersJobRef = useRef<null | { kind: 'idle'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> }>(null)
  const [syncingLayerId, setSyncingLayerId] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'data' | 'fields' | 'relationships'>('data')
  const [helpOpen, setHelpOpen] = useState(false)
  const [layerQuery, setLayerQuery] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'date'>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [layerMeta, setLayerMeta] = useState<Record<string, { createdAt: string }>>(() =>
    safeParseJson<Record<string, { createdAt: string }>>(safeLocalStorageGetItem(LS_META_KEY), {}),
  )
  const [layerOrder, setLayerOrder] = useState<string[]>(() => safeParseJson<string[]>(safeLocalStorageGetItem(LS_ORDER_KEY), []))
  const [layerFields, setLayerFields] = useState<Record<string, FieldSchema[]>>(() =>
    safeParseJson<Record<string, FieldSchema[]>>(safeLocalStorageGetItem(LS_FIELDS_KEY), {}),
  )
  const [relationships, setRelationships] = useState<Relationship[]>(() =>
    safeParseJson<Relationship[]>(safeLocalStorageGetItem(LS_RELATIONSHIPS_KEY), []),
  )
  const [hiddenFieldsByLayerId, setHiddenFieldsByLayerId] = useState<Record<string, string[]>>(() =>
    safeParseJson<Record<string, string[]>>(safeLocalStorageGetItem(LS_HIDDEN_FIELDS_KEY), {}),
  )

  const [masterSaveBusy, setMasterSaveBusy] = useState(false)
  const [masterSaveHint, setMasterSaveHint] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [layerModal, setLayerModal] = useState<null | { mode: 'edit'; layerId: string }>(null)
  const [confirm, setConfirm] = useState<
    | null
    | { kind: 'deleteLayer'; layerId: string }
    | { kind: 'deleteField'; layerId: string; fieldId: string }
    | { kind: 'deleteRelationship'; id: string }
  >(null)

  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [tab, setTab] = useState<AddLayerTab>('arcgis')
  const [serviceUrl, setServiceUrl] = useState('')
  const [token, setToken] = useState('')
  const [discoveredLayers, setDiscoveredLayers] = useState<Array<{ id: number; name: string; kind: 'layer' | 'table'; url: string; geometryType?: string }>>([])
  const [selectedDiscoveredUrl, setSelectedDiscoveredUrl] = useState('')
  const [layerName, setLayerName] = useState('')
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [addingLayerKey, setAddingLayerKey] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [remoteDataUrl, setRemoteDataUrl] = useState('')

  const [fieldModal, setFieldModal] = useState<null | { mode: 'add' | 'edit'; layerId: string; fieldId?: string }>(null)
  const [fieldDraft, setFieldDraft] = useState<{ name: string; type: FieldType; length: string; defaultValue: string; nullable: boolean }>({
    name: '',
    type: 'text',
    length: '',
    defaultValue: '',
    nullable: true,
  })
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [dragFieldId, setDragFieldId] = useState<string | null>(null)

  const [relModal, setRelModal] = useState<null | { mode: 'add' | 'edit'; id?: string }>(null)
  const [relDraft, setRelDraft] = useState<Relationship>(() => ({
    id: newId(),
    name: '',
    type: 'one-to-many',
    originLayerId: '',
    destinationLayerId: '',
    originKey: '',
    destinationKey: '',
    enforce: true,
    cascadeDelete: false,
    junctionLayerId: '',
    originJunctionKey: '',
    destinationJunctionKey: '',
  }))
  const [relError, setRelError] = useState<string | null>(null)

  const selectedLayer = useMemo(
    () => (selectedLayerId ? layers.find(l => String(l.id) === selectedLayerId) ?? null : null),
    [layers, selectedLayerId],
  )

  useEffect(() => {
    loadLayersFromDB()
      .then((saved) => {
        setLayers(saved)
        setLayersLoaded(true)
        setLayersLoadError(null)
        if (!selectedLayerId && saved.length) setSelectedLayerId(String(saved[0].id))
      })
      .catch((e: any) => {
        setLayersLoaded(true)
        setLayers([])
        setLayersLoadError(typeof e?.message === 'string' ? e.message : 'Failed to load saved layers.')
      })
  }, [])

  useEffect(() => {
    if (layersLoaded) return
    const t = window.setTimeout(() => {
      if (layersLoaded) return
      setLayersLoaded(true)
      setLayers([])
      setLayersLoadError('Loading GIS content timed out. Local storage/IndexedDB may be blocked. Use Reset to continue.')
    }, 2500)
    return () => window.clearTimeout(t)
  }, [layersLoaded])

  const resetGisContentStorage = () => {
    try {
      localStorage.removeItem(LS_META_KEY)
      localStorage.removeItem(LS_ORDER_KEY)
      localStorage.removeItem(LS_FIELDS_KEY)
      localStorage.removeItem(LS_RELATIONSHIPS_KEY)
      localStorage.removeItem(LS_HIDDEN_FIELDS_KEY)
    } catch {
    }
    try {
      if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB_NAME)
    } catch {
    }
    window.location.reload()
  }

  useEffect(() => {
    if (!syncError) return
    const t = window.setTimeout(() => setSyncError(null), 2500)
    return () => window.clearTimeout(t)
  }, [syncError])

  const cancelScheduledLayerPersist = useCallback(() => {
    if (!persistLayersJobRef.current) return
    const job = persistLayersJobRef.current
    persistLayersJobRef.current = null
    if (job.kind === 'idle') {
      ;(window as any).cancelIdleCallback?.(job.id)
    } else {
      clearTimeout(job.id)
    }
  }, [])

  useEffect(() => {
    if (!layersLoaded) return
    cancelScheduledLayerPersist()

    const run = () => {
      persistLayersJobRef.current = null
      saveLayersToDB(layers).catch(() => {})
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(run, { timeout: 2000 })
      persistLayersJobRef.current = { kind: 'idle', id }
      return () => {
        ;(window as any).cancelIdleCallback?.(id)
      }
    }

    const id = setTimeout(run, 1200)
    persistLayersJobRef.current = { kind: 'timeout', id }
    return () => {
      clearTimeout(id)
    }
  }, [layers, layersLoaded, cancelScheduledLayerPersist])

  useEffect(() => {
    safeLocalStorageSetItem(LS_META_KEY, JSON.stringify(layerMeta))
  }, [layerMeta])

  useEffect(() => {
    safeLocalStorageSetItem(LS_ORDER_KEY, JSON.stringify(layerOrder))
  }, [layerOrder])

  useEffect(() => {
    safeLocalStorageSetItem(LS_FIELDS_KEY, JSON.stringify(layerFields))
  }, [layerFields])

  useEffect(() => {
    safeLocalStorageSetItem(LS_RELATIONSHIPS_KEY, JSON.stringify(relationships))
  }, [relationships])

  useEffect(() => {
    safeLocalStorageSetItem(LS_HIDDEN_FIELDS_KEY, JSON.stringify(hiddenFieldsByLayerId))
  }, [hiddenFieldsByLayerId])

  const applyAndSaveMasterData = useCallback(async () => {
    if (!layersLoaded) {
      setMasterSaveHint({ kind: 'error', text: 'Layers are still loading.' })
      return
    }
    cancelScheduledLayerPersist()
    setMasterSaveBusy(true)
    setMasterSaveHint(null)
    try {
      await saveLayersToDB(layers)
      safeLocalStorageSetItem(LS_META_KEY, JSON.stringify(layerMeta))
      safeLocalStorageSetItem(LS_ORDER_KEY, JSON.stringify(layerOrder))
      safeLocalStorageSetItem(LS_FIELDS_KEY, JSON.stringify(layerFields))
      safeLocalStorageSetItem(LS_RELATIONSHIPS_KEY, JSON.stringify(relationships))
      safeLocalStorageSetItem(LS_HIDDEN_FIELDS_KEY, JSON.stringify(hiddenFieldsByLayerId))
      window.dispatchEvent(new CustomEvent('gis-content-master-saved', { detail: { savedAt: Date.now() } }))
      setMasterSaveHint({ kind: 'success', text: 'Master data saved.' })
    } catch (e: any) {
      setMasterSaveHint({
        kind: 'error',
        text: typeof e?.message === 'string' ? e.message : 'Could not save master data.',
      })
    } finally {
      setMasterSaveBusy(false)
    }
  }, [
    cancelScheduledLayerPersist,
    hiddenFieldsByLayerId,
    layerFields,
    layerMeta,
    layerOrder,
    layers,
    layersLoaded,
    relationships,
  ])

  useEffect(() => {
    if (!masterSaveHint) return
    const ms = masterSaveHint.kind === 'success' ? 2800 : 5200
    const t = window.setTimeout(() => setMasterSaveHint(null), ms)
    return () => window.clearTimeout(t)
  }, [masterSaveHint])

  useEffect(() => {
    const nextMeta: Record<string, { createdAt: string }> = { ...layerMeta }
    let changed = false
    layers.forEach((l) => {
      const id = String(l.id)
      if (!nextMeta[id]?.createdAt) {
        nextMeta[id] = { createdAt: new Date().toISOString() }
        changed = true
      }
    })
    if (changed) setLayerMeta(nextMeta)
  }, [layers])

  useEffect(() => {
    const ids = layers.map(l => String(l.id))
    const current = layerOrder.filter(id => ids.includes(id))
    const missing = ids.filter(id => !current.includes(id))
    if (missing.length) setLayerOrder([...current, ...missing])
  }, [layers])

  useEffect(() => {
    if (!selectedLayer) return
    const layerId = String(selectedLayer.id)
    if (layerFields[layerId]?.length) return
    const fromArc: FieldSchema[] =
      selectedLayer.source === 'arcgis' && Array.isArray(selectedLayer.arcgisLayerDefinition?.fields)
        ? (selectedLayer.arcgisLayerDefinition.fields as any[])
            .filter(f => typeof f?.name === 'string' && f.name)
            .map((f) => ({
              id: newId(),
              name: String(f.name),
              type: mapArcFieldType(typeof f?.type === 'string' ? f.type : undefined),
              length: typeof f?.length === 'number' ? f.length : undefined,
              defaultValue: '',
              nullable: typeof f?.nullable === 'boolean' ? f.nullable : true,
            }))
        : []
    const fromProps: FieldSchema[] = getGeoJsonFields(selectedLayer.data).map((name) => ({
      id: newId(),
      name,
      type: 'text',
      defaultValue: '',
      nullable: true,
    }))
    const initial = fromArc.length ? fromArc : fromProps
    setLayerFields(prev => ({ ...prev, [layerId]: initial }))
  }, [selectedLayerId, selectedLayer, layerFields])

  const rows: LayerRow[] = useMemo(() => {
    const q = layerQuery.trim().toLowerCase()
    const base = layers.map((l) => {
      const id = String(l.id)
      return {
        id,
        name: l.name,
        visible: !!l.visible,
        source: l.source,
        geometryType: getGeometryType(l),
        recordCount: getRecordCount(l),
        createdAt: layerMeta[id]?.createdAt || new Date().toISOString(),
      }
    })
    const filtered = q ? base.filter(r => r.name.toLowerCase().includes(q) || r.geometryType.toLowerCase().includes(q) || r.id.includes(q)) : base

    const orderIndex = new Map<string, number>()
    layerOrder.forEach((id, idx) => orderIndex.set(id, idx))

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'priority') {
        const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return ai - bi
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return a.createdAt.localeCompare(b.createdAt)
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  }, [layers, layerMeta, layerQuery, sortBy, sortDir, layerOrder])

  const selectedFields = useMemo(() => (selectedLayer ? layerFields[String(selectedLayer.id)] ?? [] : []), [selectedLayer, layerFields])

  const visibleFieldNames = useMemo(() => {
    if (!selectedLayer) return []
    const layerId = String(selectedLayer.id)
    const hidden = new Set(hiddenFieldsByLayerId[layerId] ?? [])
    return selectedFields.map(f => f.name).filter(n => n && !hidden.has(n))
  }, [selectedLayer, selectedFields, hiddenFieldsByLayerId])

  const applyMoveLayer = (layerId: string, direction: 'up' | 'down') => {
    const idx = layerOrder.indexOf(layerId)
    if (idx === -1) return
    const next = [...layerOrder]
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    setLayerOrder(next)
  }

  const toggleLayerVisible = (layerId: string) => {
    setLayers(prev => prev.map(l => (String(l.id) === layerId ? { ...l, visible: !l.visible } : l)))
  }

  const syncArcGisLayer = async (layerId: string) => {
    const layer = layers.find(l => String(l.id) === layerId)
    if (!layer || layer.source !== 'arcgis' || !layer.url) return
    if (syncingLayerId) return

    setSyncError(null)
    setSyncingLayerId(layerId)
    try {
      const def = await fetchArcGisLayerDefinition(layer.url, layer.authToken)
      const isTable = def?.type && String(def.type).toLowerCase() === 'table'
      const geojson = await fetchArcGisGeoJson(layer.url, layer.authToken, { returnGeometry: !isTable })
      setLayers(prev =>
        prev.map(l =>
          String(l.id) === layerId
            ? {
                ...l,
                data: geojson,
                arcgisLayerDefinition: def ?? l.arcgisLayerDefinition,
              }
            : l,
        ),
      )
    } catch (e: any) {
      setSyncError(typeof e?.message === 'string' ? e.message : 'Failed to sync from ArcGIS.')
    } finally {
      setSyncingLayerId(null)
    }
  }

  const openEditLayer = (layerId: string) => {
    const l = layers.find(x => String(x.id) === layerId)
    if (!l) return
    setEditError(null)
    setEditName(safeString(l.name))
    setLayerModal({ mode: 'edit', layerId })
  }

  const openAddLayer = () => {
    dragDepthRef.current = 0
    setIsDragOver(false)
    setUploadFile(null)
    setRemoteDataUrl('')
    setTab('arcgis')
    setServiceUrl('')
    setToken('')
    setDiscoveredLayers([])
    setSelectedDiscoveredUrl('')
    setLayerName('')
    setDiscoverError(null)
    setIsDiscovering(false)
    setAddingLayerKey(null)
    setIsAddOpen(true)
  }

  const closeEditLayerModal = () => {
    setLayerModal(null)
    setEditError(null)
  }

  const saveEditLayer = () => {
    if (!layerModal) return
    const name = normalizeName(editName)
    if (!name) {
      setEditError('Layer name is required.')
      return
    }
    setLayers(prev => prev.map(l => (String(l.id) === layerModal.layerId ? { ...l, name } : l)))
    closeEditLayerModal()
  }

  const closeAddLayer = useCallback(() => {
    dragDepthRef.current = 0
    setIsDragOver(false)
    setIsAddOpen(false)
    setDiscoverError(null)
    setIsDiscovering(false)
    setAddingLayerKey(null)
    setUploadFile(null)
    setRemoteDataUrl('')
  }, [])

  useEffect(() => {
    if (!isAddOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAddLayer()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAddOpen, closeAddLayer])

  const discoverFromService = async () => {
    setDiscoverError(null)
    setIsDiscovering(true)
    try {
      const found = await discoverArcGisLayers(serviceUrl, token)
      setDiscoveredLayers(found)
      const firstUrl = found[0]?.url ?? ''
      setSelectedDiscoveredUrl(firstUrl)
      if (firstUrl) setLayerName(found[0]?.name ?? '')
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to connect to service.')
      setDiscoveredLayers([])
      setSelectedDiscoveredUrl('')
    } finally {
      setIsDiscovering(false)
    }
  }

  const addArcGisLayerAsGeoJson = async (selected: { name: string; kind: 'layer' | 'table'; url: string; geometryType?: string }) => {
    const key = `arcgis:${selected.url}`
    setAddingLayerKey(key)
    setDiscoverError(null)
    try {
      const def = await fetchArcGisLayerDefinition(selected.url, token).catch(() => null)
      const hasGeometry =
        def?.type && String(def.type).toLowerCase() === 'table'
          ? false
          : typeof def?.geometryType === 'string'
            ? true
            : !!selected.geometryType
      const geojson = await fetchArcGisGeoJson(selected.url, token, { returnGeometry: hasGeometry })
      const name = normalizeName(layerName) || selected.name
      const newLayer: LayerData = {
        id: key,
        name,
        type: 'geojson',
        source: 'arcgis',
        visible: true,
        opacity: 1,
        data: geojson,
        url: selected.url,
        authToken: token.trim() ? token.trim() : undefined,
        arcgisLayerDefinition: def ?? undefined,
      }
      setLayers(prev => [...prev, newLayer])
      setSelectedLayerId(key)
      closeAddLayer()
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to add layer.')
    } finally {
      setAddingLayerKey(null)
    }
  }

  const setUploadFromFile = (file: File | null) => {
    setUploadFile(file)
    if (!file) return
    const current = normalizeName(layerName)
    if (current) return
    const fallback = normalizeName(file.name.replace(/\.[^.]+$/, ''))
    if (fallback) setLayerName(fallback)
  }

  const addUploadLayerAsGeoJson = async () => {
    if (!uploadFile) return
    const key = `upload:${uploadFile.name}`
    setAddingLayerKey(key)
    setDiscoverError(null)
    try {
      const parsed = await parseFile(uploadFile)
      if (parsed.type !== 'geojson') throw new Error('File must contain GIS features (GeoJSON/KML/KMZ/Shapefile zip).')
      let geojson: any = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        throw new Error('File must be a GeoJSON FeatureCollection.')
      }
      const layerId = `upload:${newId()}`
      const name = normalizeName(layerName) || normalizeName(uploadFile.name.replace(/\.[^.]+$/, '')) || 'Layer'
      const newLayer: LayerData = { id: layerId, name, type: 'geojson', source: 'upload', visible: true, opacity: 1, data: geojson }
      setLayers(prev => [...prev, newLayer])
      setSelectedLayerId(layerId)
      closeAddLayer()
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to import file.')
    } finally {
      setAddingLayerKey(null)
    }
  }

  const addUrlLayerAsGeoJson = async () => {
    const trimmed = remoteDataUrl.trim()
    if (!trimmed) return
    const opKey = `url:${trimmed}`
    setAddingLayerKey(opKey)
    setDiscoverError(null)
    try {
      const imageRoot = getImageServerServiceRootFromUrl(trimmed)
      if (imageRoot) {
        const meta = await fetchImageServerMeta(imageRoot, { token: getArcgisPortalToken() })
        const extentSource = meta.fullExtent ?? meta.extent
        const bbox = extentSource ? arcgisExtentToWgs84BBox(extentSource) : null
        const layerId = `url:esri-image:${newId()}`
        const name = normalizeName(layerName) || normalizeName(meta.name) || 'Image Server'
        const newLayer: LayerData = {
          id: layerId,
          name,
          type: 'tile',
          source: 'url',
          visible: true,
          opacity: 1,
          url: imageRoot,
          data: { esriImageServer: true },
          ...(bbox ? { bbox } : {}),
        }
        setLayers(prev => [...prev, newLayer])
        setSelectedLayerId(layerId)
        closeAddLayer()
        return
      }

      const file = await parseRemoteUrlAsFile(trimmed)
      const parsed = await parseFile(file)
      if (parsed.type !== 'geojson') {
        throw new Error('URL must resolve to GIS features (GeoJSON/KML/KMZ/Shapefile zip/CSV with coordinates).')
      }
      let geojson: any = parsed.data
      if (Array.isArray(geojson)) geojson = geojson[0]
      if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        throw new Error('URL must resolve to a GeoJSON FeatureCollection.')
      }
      const layerId = `url:${newId()}`
      const name = normalizeName(layerName) || normalizeName(file.name.replace(/\.[^.]+$/, '')) || 'Layer'
      const newLayer: LayerData = {
        id: layerId,
        name,
        type: 'geojson',
        source: 'url',
        visible: true,
        opacity: 1,
        data: geojson,
        url: trimmed,
      }
      setLayers(prev => [...prev, newLayer])
      setSelectedLayerId(layerId)
      closeAddLayer()
    } catch (e: any) {
      setDiscoverError(typeof e?.message === 'string' ? e.message : 'Failed to import from URL.')
    } finally {
      setAddingLayerKey(null)
    }
  }

  const openAddField = (layerId: string) => {
    setFieldError(null)
    setFieldDraft({ name: '', type: 'text', length: '', defaultValue: '', nullable: true })
    setFieldModal({ mode: 'add', layerId })
  }

  const openEditField = (layerId: string, fieldId: string) => {
    const fields = layerFields[layerId] ?? []
    const f = fields.find(x => x.id === fieldId)
    if (!f) return
    setFieldError(null)
    setFieldDraft({
      name: f.name,
      type: f.type,
      length: typeof f.length === 'number' ? String(f.length) : '',
      defaultValue: f.defaultValue ?? '',
      nullable: typeof f.nullable === 'boolean' ? f.nullable : true,
    })
    setFieldModal({ mode: 'edit', layerId, fieldId })
  }

  const closeFieldModal = () => {
    setFieldModal(null)
    setFieldError(null)
  }

  const applyFieldSave = () => {
    if (!fieldModal) return
    const layerId = fieldModal.layerId
    const existing = layerFields[layerId] ?? []
    const name = normalizeName(fieldDraft.name)
    if (!name) {
      setFieldError('Field name is required.')
      return
    }
    if (!isValidFieldName(name)) {
      setFieldError('Field name must start with a letter/underscore and contain only letters, numbers, and underscores.')
      return
    }
    const dup = existing.find(f => f.name.toLowerCase() === name.toLowerCase() && f.id !== fieldModal.fieldId)
    if (dup) {
      setFieldError('Field name already exists.')
      return
    }
    const lengthNum = fieldDraft.length.trim() ? Number(fieldDraft.length) : undefined
    if (fieldDraft.type === 'text' && fieldDraft.length.trim() && (!Number.isFinite(lengthNum) || (lengthNum as number) <= 0)) {
      setFieldError('Length must be a positive number.')
      return
    }

    const nextField: FieldSchema = {
      id: fieldModal.mode === 'add' ? newId() : (fieldModal.fieldId as string),
      name,
      type: fieldDraft.type,
      length: fieldDraft.type === 'text' && typeof lengthNum === 'number' ? Math.round(lengthNum) : undefined,
      defaultValue: fieldDraft.defaultValue,
      nullable: fieldDraft.nullable,
    }

    if (fieldModal.mode === 'add') {
      setLayerFields(prev => ({ ...prev, [layerId]: [...existing, nextField] }))
      setLayers(prev =>
        prev.map((l) => {
          if (String(l.id) !== layerId) return l
          if (!l.data || !Array.isArray((l.data as any).features)) return l
          const features = (l.data as any).features as any[]
          const rawDefault = (nextField.defaultValue ?? '').trim()
          const defVal =
            rawDefault === ''
              ? null
              : nextField.type === 'number'
                ? Number(rawDefault)
                : nextField.type === 'boolean'
                  ? rawDefault === 'true' || rawDefault === '1'
                  : rawDefault
          const updated = features.map((f) => ({
            ...f,
            properties: { ...(f?.properties ?? {}), [name]: defVal },
          }))
          return { ...l, data: { ...l.data, features: updated } }
        }),
      )
      closeFieldModal()
      return
    }

    const prevField = existing.find(f => f.id === fieldModal.fieldId)
    if (!prevField) return
    setLayerFields(prev => ({ ...prev, [layerId]: existing.map(f => (f.id === prevField.id ? nextField : f)) }))

    if (prevField.name !== nextField.name) {
      setLayers(prev =>
        prev.map((l) => {
          if (String(l.id) !== layerId) return l
          if (!l.data || !Array.isArray((l.data as any).features)) return l
          const features = (l.data as any).features as any[]
          const updated = features.map((f) => {
            const props = { ...(f?.properties ?? {}) }
            if (Object.prototype.hasOwnProperty.call(props, prevField.name)) {
              props[nextField.name] = props[prevField.name]
              delete props[prevField.name]
            }
            return { ...f, properties: props }
          })
          return { ...l, data: { ...l.data, features: updated } }
        }),
      )
    }
    closeFieldModal()
  }

  const applyFieldReorder = (layerId: string, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const arr = layerFields[layerId] ?? []
    const fromIdx = arr.findIndex(f => f.id === sourceId)
    const toIdx = arr.findIndex(f => f.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...arr]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    setLayerFields(prev => ({ ...prev, [layerId]: next }))
  }

  const applyDeleteLayer = (layerId: string) => {
    setLayers(prev => prev.filter(l => String(l.id) !== layerId))
    setRelationships(prev => prev.filter(r => r.originLayerId !== layerId && r.destinationLayerId !== layerId && r.junctionLayerId !== layerId))
    setLayerFields(prev => {
      const next = { ...prev }
      delete next[layerId]
      return next
    })
    setHiddenFieldsByLayerId(prev => {
      const next = { ...prev }
      delete next[layerId]
      return next
    })
    setLayerOrder(prev => prev.filter(id => id !== layerId))
    setLayerMeta(prev => {
      const next = { ...prev }
      delete next[layerId]
      return next
    })
    if (selectedLayerId === layerId) setSelectedLayerId(null)
  }

  const applyDeleteField = (layerId: string, fieldId: string) => {
    const fields = layerFields[layerId] ?? []
    const target = fields.find(f => f.id === fieldId)
    if (!target) return
    const usedInRelationship = relationships.some((r) => {
      if (r.originLayerId === layerId && r.originKey === target.name) return true
      if (r.destinationLayerId === layerId && r.destinationKey === target.name) return true
      if (r.junctionLayerId === layerId && (r.originJunctionKey === target.name || r.destinationJunctionKey === target.name)) return true
      return false
    })
    if (usedInRelationship) {
      window.alert('Cannot delete this field because it is used by a relationship. Edit or delete the relationship first.')
      return
    }
    setLayerFields(prev => ({ ...prev, [layerId]: fields.filter(f => f.id !== fieldId) }))
    setLayers(prev =>
      prev.map((l) => {
        if (String(l.id) !== layerId) return l
        if (!l.data || !Array.isArray((l.data as any).features)) return l
        const features = (l.data as any).features as any[]
        const updated = features.map((f) => {
          const props = { ...(f?.properties ?? {}) }
          delete props[target.name]
          return { ...f, properties: props }
        })
        return { ...l, data: { ...l.data, features: updated } }
      }),
    )
  }

  const openAddRelationship = () => {
    setRelError(null)
    setRelDraft({
      id: newId(),
      name: '',
      type: 'one-to-many',
      originLayerId: selectedLayerId ?? '',
      destinationLayerId: '',
      originKey: '',
      destinationKey: '',
      enforce: true,
      cascadeDelete: false,
      junctionLayerId: '',
      originJunctionKey: '',
      destinationJunctionKey: '',
    })
    setRelModal({ mode: 'add' })
  }

  const openEditRelationship = (id: string) => {
    const r = relationships.find(x => x.id === id)
    if (!r) return
    setRelError(null)
    setRelDraft({ ...r })
    setRelModal({ mode: 'edit', id })
  }

  const closeRelModal = () => {
    setRelModal(null)
    setRelError(null)
  }

  const relationshipKeyFieldsForLayer = (layerId: string) => {
    const fields = layerFields[layerId] ?? []
    return fields.map(f => f.name).filter(Boolean)
  }

  const validateRelationship = (draft: Relationship) => {
    if (!draft.name.trim()) return 'Relationship name is required.'
    if (!draft.originLayerId || !draft.destinationLayerId) return 'Select origin and destination layers.'
    if (draft.originLayerId === draft.destinationLayerId && draft.type !== 'many-to-many') return 'You can only relate a layer to itself via Many-to-Many.'
    if (!draft.originKey || !draft.destinationKey) return 'Select key fields.'
    if (draft.type === 'many-to-many') {
      if (!draft.junctionLayerId) return 'Select a junction layer for Many-to-Many.'
      if (!draft.originJunctionKey || !draft.destinationJunctionKey) return 'Select junction keys.'
    }
    const dup = relationships.find(r => r.id !== draft.id && r.name.trim().toLowerCase() === draft.name.trim().toLowerCase())
    if (dup) return 'Relationship name already exists.'
    return null
  }

  const saveRelationship = () => {
    const err = validateRelationship(relDraft)
    if (err) {
      setRelError(err)
      return
    }
    if (relModal?.mode === 'edit') {
      setRelationships(prev => prev.map(r => (r.id === relDraft.id ? relDraft : r)))
    } else {
      setRelationships(prev => [...prev, relDraft])
    }
    closeRelModal()
  }

  const relationshipTree = useMemo(() => {
    const byOrigin = new Map<string, Relationship[]>()
    relationships.forEach((r) => {
      const list = byOrigin.get(r.originLayerId) ?? []
      list.push(r)
      byOrigin.set(r.originLayerId, list)
    })
    return { byOrigin }
  }, [relationships])

  const renderMainHeader = () => (
    <div className="gis-content-header">
      <div className="gis-content-title">
        <i className="fa-solid fa-layer-group" aria-hidden="true" />
        <span>GIS Layers</span>
      </div>
      <div className="gis-content-header-right">
        {masterSaveHint ? (
          <span
            className={
              masterSaveHint.kind === 'error'
                ? 'gis-content-master-save-hint gis-content-master-save-hint--error'
                : 'gis-content-master-save-hint'
            }
            role="status"
          >
            {masterSaveHint.text}
          </span>
        ) : null}
        <button
          type="button"
          className="gis-btn gis-btn-primary gis-content-master-save-btn"
          onClick={() => void applyAndSaveMasterData()}
          disabled={!layersLoaded || masterSaveBusy || !!layersLoadError}
          title="Persist layers and schema to browser storage (IndexedDB + localStorage) as master data for the map, data entry, and Geo AI."
        >
          {masterSaveBusy ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
              <span>Saving…</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
              <span>Apply and Save</span>
            </>
          )}
        </button>
        <div className="gis-content-tabs" role="tablist" aria-label="Layer management tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'data'}
            className={activeTab === 'data' ? 'gis-content-tab active' : 'gis-content-tab'}
            onClick={() => setActiveTab('data')}
            disabled={!selectedLayer}
          >
            Data
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'fields'}
            className={activeTab === 'fields' ? 'gis-content-tab active' : 'gis-content-tab'}
            onClick={() => setActiveTab('fields')}
            disabled={!selectedLayer}
          >
            Fields
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'relationships'}
            className={activeTab === 'relationships' ? 'gis-content-tab active' : 'gis-content-tab'}
            onClick={() => setActiveTab('relationships')}
          >
            Relationships
          </button>
          <button className="gis-content-tab gis-content-tab-docs" type="button" onClick={() => setHelpOpen(true)}>
            <i className="fa-solid fa-book" aria-hidden="true" />
            <span>Documentation</span>
          </button>
        </div>
      </div>
    </div>
  )

  const renderRecords = () => {
    if (!selectedLayer) return <div className="gis-content-empty">Select a layer from the list to view data.</div>
    const layerId = String(selectedLayer.id)
    const hidden = hiddenFieldsByLayerId[layerId] ?? []
    return (
      <RecordsPanel
        layer={selectedLayer}
        fields={selectedFields}
        hiddenFields={hidden}
        setHiddenFields={(next) => setHiddenFieldsByLayerId(prev => ({ ...prev, [layerId]: next }))}
      />
    )
  }

  const [fieldSortBy, setFieldSortBy] = useState<'name' | 'type' | 'length' | 'domain' | 'subtype' | 'default' | 'nullable'>('name')
  const [fieldSortDir, setFieldSortDir] = useState<'asc' | 'desc'>('asc')
  const [fieldQuery, setFieldQuery] = useState('')

  const renderFields = () => {
    if (!selectedLayer) return <div className="gis-content-empty">Select a layer first.</div>
    const layerId = String(selectedLayer.id)
    const fields = layerFields[layerId] ?? []
    
    const arcDef = selectedLayer.source === 'arcgis' ? selectedLayer.arcgisLayerDefinition : null
    const arcFields = Array.isArray(arcDef?.fields) ? (arcDef.fields as any[]) : []
    const arcTypes = Array.isArray(arcDef?.types) ? (arcDef.types as any[]) : []
    const typeIdField = typeof arcDef?.typeIdField === 'string' ? arcDef.typeIdField : ''

    const enrichedFields = fields.map(f => {
      const arcField = arcFields.find(af => String(af?.name).toLowerCase() === f.name.toLowerCase())
      const domain = arcField?.domain
      const domainName = domain?.name ? String(domain.name) : domain?.type ? String(domain.type) : '—'
      
      let subtypeDesc = '—'
      if (typeIdField && f.name.toLowerCase() === typeIdField.toLowerCase()) {
        subtypeDesc = 'Subtype Field'
      } else if (arcTypes.some(t => t.domains && t.domains[f.name])) {
        subtypeDesc = 'Varies by Subtype'
      }

      return {
        ...f,
        domainName,
        subtypeDesc
      }
    })

    const filtered = fieldQuery.trim() 
      ? enrichedFields.filter(f => f.name.toLowerCase().includes(fieldQuery.toLowerCase()) || f.type.toLowerCase().includes(fieldQuery.toLowerCase()))
      : enrichedFields

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (fieldSortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (fieldSortBy === 'type') cmp = a.type.localeCompare(b.type)
      else if (fieldSortBy === 'length') cmp = (a.length || 0) - (b.length || 0)
      else if (fieldSortBy === 'domain') cmp = a.domainName.localeCompare(b.domainName)
      else if (fieldSortBy === 'subtype') cmp = a.subtypeDesc.localeCompare(b.subtypeDesc)
      else if (fieldSortBy === 'default') cmp = (a.defaultValue || '').localeCompare(b.defaultValue || '')
      else if (fieldSortBy === 'nullable') cmp = (a.nullable === false ? 0 : 1) - (b.nullable === false ? 0 : 1)
      return fieldSortDir === 'asc' ? cmp : -cmp
    })

    const toggleSort = (col: typeof fieldSortBy) => {
      if (fieldSortBy === col) setFieldSortDir(d => d === 'asc' ? 'desc' : 'asc')
      else {
        setFieldSortBy(col)
        setFieldSortDir('asc')
      }
    }

    const renderSortIcon = (col: typeof fieldSortBy) => {
      if (fieldSortBy !== col) return <i className="fa-solid fa-sort gis-content-muted" style={{ marginLeft: 6, fontSize: 10 }} />
      return <i className={`fa-solid fa-sort-${fieldSortDir === 'asc' ? 'up' : 'down'}`} style={{ marginLeft: 6, fontSize: 10 }} />
    }

    return (
      <div className="gis-content-panel">
        <div className="gis-content-panelbar">
          <div className="gis-content-paneltitle">Field Management</div>
          <div className="gis-content-panelactions">
            <input 
              className="gis-input gis-content-search" 
              value={fieldQuery} 
              onChange={(e) => setFieldQuery(e.target.value)} 
              placeholder="Filter fields..." 
            />
            <button className="gis-btn gis-btn-primary" type="button" onClick={() => openAddField(layerId)}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              <span>Add field</span>
            </button>
          </div>
        </div>

        <div className="gis-content-tablewrap">
          <table className="gis-content-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>Name {renderSortIcon('name')}</th>
                <th onClick={() => toggleSort('type')} style={{ cursor: 'pointer' }}>Type {renderSortIcon('type')}</th>
                <th onClick={() => toggleSort('length')} style={{ cursor: 'pointer' }}>Length {renderSortIcon('length')}</th>
                <th onClick={() => toggleSort('domain')} style={{ cursor: 'pointer' }}>Domain {renderSortIcon('domain')}</th>
                <th onClick={() => toggleSort('subtype')} style={{ cursor: 'pointer' }}>Subtype Description {renderSortIcon('subtype')}</th>
                <th onClick={() => toggleSort('default')} style={{ cursor: 'pointer' }}>Default {renderSortIcon('default')}</th>
                <th onClick={() => toggleSort('nullable')} style={{ cursor: 'pointer' }}>Nullable {renderSortIcon('nullable')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => (
                <tr
                  key={f.id}
                  draggable={!fieldQuery && fieldSortBy === 'name'}
                  onDragStart={() => setDragFieldId(f.id)}
                  onDragOver={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={() => {
                    if (!dragFieldId) return
                    applyFieldReorder(layerId, dragFieldId, f.id)
                    setDragFieldId(null)
                  }}
                  className={!fieldQuery && fieldSortBy === 'name' ? "gis-content-draggable" : ""}
                >
                  <td title={f.name}>
                    {!fieldQuery && fieldSortBy === 'name' ? (
                      <span className="gis-content-draghandle" aria-hidden="true">
                        <i className="fa-solid fa-grip-vertical" />
                      </span>
                    ) : null}
                    {f.name}
                  </td>
                  <td>{f.type}</td>
                  <td>{typeof f.length === 'number' ? f.length : '—'}</td>
                  <td title={f.domainName !== '—' ? f.domainName : undefined}>{f.domainName}</td>
                  <td title={f.subtypeDesc !== '—' ? f.subtypeDesc : undefined}>{f.subtypeDesc}</td>
                  <td title={f.defaultValue || ''}>{f.defaultValue || '—'}</td>
                  <td>{f.nullable === false ? 'No' : 'Yes'}</td>
                  <td className="gis-content-actions">
                    <button className="gis-btn" type="button" onClick={() => openEditField(layerId, f.id)}>
                      Edit
                    </button>
                    <button className="gis-btn" type="button" onClick={() => setConfirm({ kind: 'deleteField', layerId, fieldId: f.id })}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!sorted.length ? (
                <tr>
                  <td colSpan={8} className="gis-content-muted">
                    No fields found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!fieldQuery && fieldSortBy === 'name' ? (
          <div className="gis-content-muted" style={{ marginTop: 8 }}>Drag and drop fields to reorder.</div>
        ) : (
          <div className="gis-content-muted" style={{ marginTop: 8 }}>Clear filter and sort by Name to enable drag-and-drop reordering.</div>
        )}
      </div>
    )
  }

  const renderRelationships = () => {
    const layersById = new Map<string, LayerRow>(rows.map(r => [r.id, r]))
    const originLayersWithRelationships = rows.filter(lr => (relationshipTree.byOrigin.get(lr.id) ?? []).length > 0)
    return (
      <div className="gis-content-panel">
        <div className="gis-content-panelbar">
          <div className="gis-content-paneltitle">Relationships</div>
          <div className="gis-content-panelactions">
            <button className="gis-btn gis-btn-primary" type="button" onClick={openAddRelationship} disabled={!layers.length}>
              <i className="fa-solid fa-link" aria-hidden="true" />
              <span>Add relationship</span>
            </button>
          </div>
        </div>

        <div className="gis-content-split">
          <div className="gis-content-card">
            <div className="gis-content-cardtitle">Relationship list</div>
            <div className="gis-content-list">
              {relationships.map((r) => (
                <div key={r.id} className="gis-content-relrow">
                  <div className="gis-content-relmain">
                    <div className="gis-content-reltitle" title={r.name}>
                      {r.name}
                    </div>
                    <div className="gis-content-relmeta">
                      <span>{r.type}</span>
                      <span>•</span>
                      <span title={r.originLayerId}>{layersById.get(r.originLayerId)?.name ?? r.originLayerId}</span>
                      <span>→</span>
                      <span title={r.destinationLayerId}>{layersById.get(r.destinationLayerId)?.name ?? r.destinationLayerId}</span>
                    </div>
                  </div>
                  <div className="gis-content-actions">
                    <button className="gis-btn" type="button" onClick={() => openEditRelationship(r.id)}>
                      Edit
                    </button>
                    <button className="gis-btn" type="button" onClick={() => setConfirm({ kind: 'deleteRelationship', id: r.id })}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {!relationships.length ? <div className="gis-content-muted">No relationships.</div> : null}
            </div>
          </div>

          <div className="gis-content-card">
            <div className="gis-content-cardtitle">Relationship tree</div>
            <div className="gis-content-tree" aria-label="Relationship tree">
              {!rows.length ? (
                <div className="gis-content-muted">Add layers in the sidebar to build relationships.</div>
              ) : !relationships.length ? (
                <div className="gis-content-muted">Add a relationship to show layers in the tree.</div>
              ) : originLayersWithRelationships.length === 0 ? (
                <div className="gis-content-muted">Saved relationships do not match current layers.</div>
              ) : (
                originLayersWithRelationships.map((lr) => {
                  const rels = relationshipTree.byOrigin.get(lr.id) ?? []
                  return (
                    <div key={lr.id} className="gis-content-treegroup">
                      <div className="gis-content-treenode root" title={lr.name}>
                        {lr.name}
                      </div>
                      <div className="gis-content-treechildren">
                        {rels.map((r) => {
                          const dest = layersById.get(r.destinationLayerId)
                          const mid =
                            r.type === 'many-to-many' && r.junctionLayerId
                              ? layersById.get(r.junctionLayerId)?.name ?? r.junctionLayerId
                              : null
                          return (
                            <div key={r.id} className="gis-content-treeedge">
                              <div className="gis-content-treelabel">
                                {r.type} ({r.originKey}→{r.destinationKey})
                              </div>
                              {mid ? (
                                <div className="gis-content-treenode" title={mid}>
                                  {mid}
                                </div>
                              ) : null}
                              <div className="gis-content-treenode" title={dest?.name ?? r.destinationLayerId}>
                                {dest?.name ?? r.destinationLayerId}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderMain = () => {
    if (activeTab === 'fields') return renderFields()
    if (activeTab === 'relationships') return renderRelationships()
    return renderRecords()
  }

  return (
    <div className={`gis-map-page gis-content-page${sidebarCollapsed ? ' gis-sidebar-collapsed' : ''}`} dir="ltr" lang="en">
      {!layersLoaded ? (
        <div className="gis-empty" style={{ margin: 16 }}>
          <div className="gis-empty-title">Loading GIS Content…</div>
          <div className="gis-empty-sub">Initializing local storage.</div>
        </div>
      ) : null}

      {layersLoadError ? (
        <div className="gis-empty" style={{ margin: 16 }}>
          <div className="gis-empty-title">GIS Content failed to load</div>
          <div className="gis-empty-sub">{layersLoadError}</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="gis-btn" type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
            <button className="gis-btn gis-btn-danger" type="button" onClick={resetGisContentStorage}>
              Reset storage
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`gis-content-unified${sidebarCollapsed ? ' gis-content-unified--collapsed' : ''}`}
      >
      <aside className={`gis-sidebar${sidebarCollapsed ? ' gis-sidebar--collapsed' : ''}`} aria-label="GIS Layers Sidebar">
        <div className="gis-sidebar-header">
          <div className="gis-sidebar-title">
            <i className="fa-solid fa-map" aria-hidden="true" />
            <span className="gis-sidebar-title-text">GIS Layers</span>
          </div>
          <div className="gis-sidebar-actions" aria-label="Sidebar tools">
            <button
              className="gis-addlayer-btn gis-addlayer-btn--icon-only"
              type="button"
              onClick={openAddLayer}
              aria-label="Add layer"
              title="Add layer"
            >
              <i className="fa-solid fa-plus" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="gis-sidebar-body" id="gis-sidebar-panel">
          {sidebarCollapsed ? (
            <>
            <div className="gis-sidebar-body-main gis-sidebar-body-main--collapsed-rail">
            <button
              type="button"
              className="gis-sidebar-collapsed-layers"
              onClick={() => setSidebarCollapsed(false)}
              aria-label={`Expand to browse ${rows.length} layer${rows.length === 1 ? '' : 's'}`}
              title="Expand layers list"
            >
              <span className="gis-sidebar-collapsed-layers__visual" aria-hidden>
                <span className="gis-sidebar-collapsed-layers__stack-bars">
                  <span className="gis-sidebar-collapsed-layers__stack-bar" />
                  <span className="gis-sidebar-collapsed-layers__stack-bar" />
                  <span className="gis-sidebar-collapsed-layers__stack-bar" />
                </span>
                <span className="gis-sidebar-collapsed-layers__icon-slot">
                  <span className="gis-sidebar-collapsed-layers__icon-wrap">
                    <i className="fa-solid fa-layer-group" />
                  </span>
                  {rows.length > 0 ? (
                    <span className="gis-sidebar-collapsed-layers__badge">{rows.length}</span>
                  ) : null}
                </span>
              </span>
              <span className="gis-sidebar-collapsed-layers__caption">layers</span>
            </button>
            </div>
            <footer className="gis-sidebar-foot-toolbar" aria-label="Sidebar tools">
              <div className="gis-sidebar-foot-divider" aria-hidden />
              <div
                className="gis-sidebar-foot-note"
                title="GIS Content: browse layers, records, fields, and relationships from this sidebar."
                role="note"
              >
                <span className="gis-sidebar-foot-item__glyph gis-sidebar-foot-item__glyph--info" aria-hidden>
                  <i className="fa-solid fa-circle-info" />
                </span>
                <span className="gis-sidebar-foot-item__label">Information</span>
              </div>
              <button
                type="button"
                className="gis-sidebar-foot-item gis-sidebar-foot-item--primary"
                onClick={() => setSidebarCollapsed(false)}
                aria-controls="gis-sidebar-panel"
                aria-expanded={false}
                aria-label="Expand GIS layers panel"
                title="Expand"
              >
                <span className="gis-sidebar-foot-item__glyph" aria-hidden>
                  <i className="fa-solid fa-angles-right" />
                </span>
                <span className="gis-sidebar-foot-item__label">Expand</span>
              </button>
            </footer>
            </>
          ) : (
            <>
            <div className="gis-sidebar-body-main">
          <div className="gis-content-sidebarfilters">
            <input className="gis-input gis-layer-search" value={layerQuery} onChange={(e) => setLayerQuery(e.target.value)} placeholder="Search for a layer..." />
            <div className="gis-content-filterrow">
              <div className="gis-content-selectwrap">
                <select className="gis-content-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} aria-label="Sort by">
                  <option value="priority">Priority</option>
                  <option value="name">Name</option>
                  <option value="date">Created date</option>
                </select>
                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
              </div>
              <button className="gis-btn" type="button" onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} aria-label="Reverse sort direction">
                {sortDir === 'asc' ? 'Ascending' : 'Descending'}
              </button>
            </div>
            {syncError ? (
              <div className="gis-content-muted" style={{ color: '#b91c1c', fontWeight: 800 }}>
                {syncError}
              </div>
            ) : null}
          </div>

          <div className="gis-layer-list">
            {rows.map((r) => {
              const layer = layers.find(l => String(l.id) === r.id)
              const canSync = r.source === 'arcgis' && Boolean(layer?.url)
              const isSyncing = syncingLayerId === r.id

              return (
                <div
                  key={r.id}
                  className={selectedLayerId === r.id ? 'gis-layer-card active' : 'gis-layer-card'}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedLayerId(r.id)
                    if (activeTab === 'relationships') return
                    setActiveTab('data')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedLayerId(r.id)
                    }
                  }}
                >
                <div className="gis-layer-top">
                  <div className="gis-layer-title">
                    <div className="gis-layer-name" title={r.name}>
                      {r.name}
                    </div>
                    <div className="gis-content-submeta">
                      <span>{r.geometryType}</span>
                      <span>•</span>
                      <span>{r.recordCount} records</span>
                    </div>
                  </div>
                  <div className="gis-layer-menu">
                    <button
                      className="gis-layer-menu-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLayerVisible(r.id)
                      }}
                      aria-label={r.visible ? 'Hide layer' : 'Show layer'}
                      title={r.visible ? 'Hide' : 'Show'}
                    >
                      <i className={`fa-solid ${r.visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden="true" />
                    </button>
                    <button
                      className="gis-layer-menu-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditLayer(r.id)
                      }}
                      aria-label="Edit layer"
                      title="Edit"
                    >
                      <i className="fa-solid fa-pen" aria-hidden="true" />
                    </button>
                    <button
                      className="gis-layer-menu-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void syncArcGisLayer(r.id)
                      }}
                      disabled={!canSync || Boolean(syncingLayerId)}
                      aria-label={`Sync ${r.name} from ArcGIS`}
                      title="Sync from ArcGIS"
                    >
                      <i
                        className={isSyncing ? 'fa-solid fa-arrows-rotate fa-spin' : 'fa-solid fa-arrows-rotate'}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      className="gis-layer-menu-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirm({ kind: 'deleteLayer', layerId: r.id })
                      }}
                      aria-label="Delete layer"
                      title="Delete"
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="gis-content-layerfooter">
                  <div className="gis-content-muted" title={r.createdAt}>
                    {new Date(r.createdAt).toLocaleDateString('en-US')}
                  </div>
                  <div className="gis-content-order">
                    <button
                      className="gis-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        applyMoveLayer(r.id, 'up')
                      }}
                      aria-label="Increase layer priority"
                    >
                      ↑
                    </button>
                    <button
                      className="gis-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        applyMoveLayer(r.id, 'down')
                      }}
                      aria-label="Decrease layer priority"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
              )
            })}
            {!rows.length ? (
              <div className="gis-empty">
                <div className="gis-empty-title">No layers</div>
                <div className="gis-empty-sub">Add a GeoJSON layer or connect an ArcGIS service.</div>
              </div>
            ) : null}
          </div>
            </div>
            <footer className="gis-sidebar-foot-toolbar" aria-label="Sidebar tools">
              <div className="gis-sidebar-foot-divider" aria-hidden />
              <div
                className="gis-sidebar-foot-note"
                title="GIS Content: browse layers, records, fields, and relationships from this sidebar."
                role="note"
              >
                <span className="gis-sidebar-foot-item__glyph gis-sidebar-foot-item__glyph--info" aria-hidden>
                  <i className="fa-solid fa-circle-info" />
                </span>
                <span className="gis-sidebar-foot-item__label">Information</span>
              </div>
              <button
                type="button"
                className="gis-sidebar-foot-item gis-sidebar-foot-item--primary"
                onClick={() => setSidebarCollapsed(true)}
                aria-controls="gis-sidebar-panel"
                aria-expanded
                aria-label="Collapse GIS layers panel"
                title="Collapse"
              >
                <span className="gis-sidebar-foot-item__glyph" aria-hidden>
                  <i className="fa-solid fa-angles-left" />
                </span>
                <span className="gis-sidebar-foot-item__label">Collapse</span>
              </button>
            </footer>
            </>
          )}
        </div>
      </aside>

      <section className="gis-map-canvas gis-content-canvas" aria-label="GIS Content">
        {renderMainHeader()}
        <div className="gis-content-body">{renderMain()}</div>
      </section>
      </div>

      {layerModal ? (
        <div className="gis-modal-overlay" role="presentation" onClick={closeEditLayerModal}>
          <div className="gis-modal gis-modal-compact" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="gis-modal-header">
              <div className="gis-modal-header-left">
                <div className="gis-modal-icon" aria-hidden="true">
                  <i className="fa-solid fa-layer-group" aria-hidden="true" />
                </div>
                <div className="gis-modal-title">Edit layer</div>
              </div>
              <button className="gis-sidebar-close" type="button" onClick={closeEditLayerModal} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="gis-modal-body">
              <div className="gis-content-formgrid">
                <label className="gis-label">
                  Layer name
                  <input
                    className={editError && !editName.trim() ? 'gis-input invalid' : 'gis-input'}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Layer name"
                  />
                </label>
                {editError ? <div className="gis-inline-error">{editError}</div> : null}
              </div>
            </div>
            <div className="gis-modal-actions">
              <button className="gis-btn" type="button" onClick={closeEditLayerModal}>
                Cancel
              </button>
              <button className="gis-btn gis-btn-primary" type="button" onClick={saveEditLayer}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAddOpen ? (
        <div className="gis-modal-overlay" role="presentation" onClick={closeAddLayer}>
          <div
            className="gis-modal gis-modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gis-add-layer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gis-modal-compact-title" id="gis-add-layer-title">
              Add GIS Layer
            </div>

            <div className="gis-modal-compact-tabs" role="tablist" aria-label="Add GIS layer source">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'arcgis'}
                aria-label="ArcGIS Feature Service"
                title="ArcGIS Feature Service"
                className={(tab === 'arcgis' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                onClick={() => setTab('arcgis')}
              >
                <i className="fa-solid fa-cloud" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'upload'}
                aria-label="Upload file"
                title="Upload file"
                className={(tab === 'upload' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                onClick={() => setTab('upload')}
              >
                <i className="fa-solid fa-file-arrow-up" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'url'}
                aria-label="URL or web data"
                title="Link to a web URL (GeoJSON, KML, CSV, ArcGIS REST export, documents)"
                className={(tab === 'url' ? 'gis-compact-tab active' : 'gis-compact-tab') + ' gis-compact-tab--icon'}
                onClick={() => setTab('url')}
              >
                <i className="fa-solid fa-globe" aria-hidden="true" />
              </button>
            </div>

            <div className="gis-modal-body">
              {tab === 'arcgis' ? (
                <div key="arcgis" role="tabpanel" aria-label="ArcGIS Feature Service">
                  <input
                    className="gis-input"
                    type="text"
                    value={serviceUrl}
                    onChange={(e) => setServiceUrl(e.target.value)}
                    placeholder="Feature Service URL"
                    autoComplete="off"
                    inputMode="url"
                    aria-label="Feature Service URL"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        discoverFromService()
                      }
                    }}
                  />

                  <input
                    className="gis-input"
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Token / API Key (optional)"
                    autoComplete="off"
                    aria-label="Token / API Key (optional)"
                  />

                  <button className="gis-btn-outline" type="button" onClick={discoverFromService} disabled={isDiscovering || serviceUrl.trim() === ''}>
                    <i className="fa-solid fa-link" aria-hidden="true" />
                    {isDiscovering ? 'Connecting…' : 'Connect & Discover Layers'}
                  </button>

                  {discoverError ? (
                    <div className="gis-inline-error" role="alert">
                      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                      <span>{discoverError}</span>
                    </div>
                  ) : null}

                  {discoveredLayers.length > 0 ? (
                    <div className="gis-discover-panel" aria-label="Discovered layers panel">
                      <div className="gis-discover-meta">FOUND {discoveredLayers.length} LAYER/TABLE(S):</div>

                      <div className="gis-form-field">
                        <div className="gis-form-label">Select Layer</div>
                        <div className="gis-select-wrap">
                          <select
                            className="gis-input gis-select"
                            value={selectedDiscoveredUrl}
                            onChange={(e) => {
                              const next = e.target.value
                              setSelectedDiscoveredUrl(next)
                              const found = discoveredLayers.find(d => d.url === next)
                              if (found) setLayerName(found.name)
                            }}
                            aria-label="Select discovered layer"
                          >
                            {discoveredLayers.map((l) => (
                              <option key={l.url} value={l.url}>
                                {l.kind === 'table' ? `${l.name} (Table)` : l.geometryType ? `${l.name} (${l.geometryType})` : l.name}
                              </option>
                            ))}
                          </select>
                          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                        </div>
                      </div>

                      <div className="gis-form-field">
                        <div className="gis-form-label">Layer Name</div>
                        <input
                          className="gis-input"
                          type="text"
                          value={layerName}
                          onChange={(e) => setLayerName(e.target.value)}
                          placeholder="Layer Name"
                          autoComplete="off"
                          aria-label="Layer Name"
                        />
                      </div>

                      <button
                        className="gis-btn-primary-full"
                        type="button"
                        onClick={() => {
                          const found = discoveredLayers.find(d => d.url === selectedDiscoveredUrl)
                          if (found) addArcGisLayerAsGeoJson(found)
                        }}
                        disabled={!selectedDiscoveredUrl || addingLayerKey === `arcgis:${selectedDiscoveredUrl}`}
                      >
                        {addingLayerKey === `arcgis:${selectedDiscoveredUrl}` ? 'Adding…' : 'Add Layer'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : tab === 'upload' ? (
                <div key="upload" role="tabpanel" aria-label="Upload file">
                  <div
                    className={isDragOver ? 'gis-dropzone drag-over' : 'gis-dropzone'}
                    role="button"
                    tabIndex={0}
                    aria-label="Drop a file here or click to browse"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const types = Array.from(e.dataTransfer?.types ?? [])
                      if (!types.includes('Files')) return
                      dragDepthRef.current += 1
                      setIsDragOver(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const types = Array.from(e.dataTransfer?.types ?? [])
                      if (!types.includes('Files')) return
                      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
                      if (dragDepthRef.current === 0) setIsDragOver(false)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      dragDepthRef.current = 0
                      setIsDragOver(false)
                      const file = e.dataTransfer?.files?.[0] ?? null
                      setUploadFromFile(file)
                    }}
                  >
                    <div className="gis-dropzone-icon" aria-hidden="true">
                      <i className="fa-solid fa-upload" />
                    </div>
                    <div className="gis-dropzone-text">Drop a file here or click to browse</div>
                    <div className="gis-dropzone-subtext">Supports: GeoJSON, KML, KMZ, Shapefile (.zip)</div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => setUploadFromFile(e.target.files?.[0] ?? null)}
                  />

                  <input
                    className="gis-input"
                    type="text"
                    value={layerName}
                    onChange={(e) => setLayerName(e.target.value)}
                    placeholder="Layer Name (optional)"
                    autoComplete="off"
                    aria-label="Layer Name (optional)"
                  />

                  <button
                    className="gis-btn-primary-full"
                    type="button"
                    onClick={addUploadLayerAsGeoJson}
                    disabled={!uploadFile || addingLayerKey === `upload:${uploadFile.name}`}
                  >
                    <i className="fa-solid fa-upload" aria-hidden="true" />
                    {addingLayerKey === `upload:${uploadFile?.name ?? ''}` ? 'Uploading…' : 'Upload & Import'}
                  </button>
                </div>
              ) : (
                <div key="url" role="tabpanel" aria-label="URL or web data">
                  <input
                    className="gis-input"
                    type="url"
                    value={remoteDataUrl}
                    onChange={(e) => setRemoteDataUrl(e.target.value)}
                    placeholder="https://… (GeoJSON, KML, KMZ, CSV, or other supported format)"
                    autoComplete="off"
                    inputMode="url"
                    aria-label="Data file or service URL"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addUrlLayerAsGeoJson()
                      }
                    }}
                  />

                  <p className="gis-dropzone-subtext" style={{ margin: 0 }}>
                    ArcGIS ImageServer URLs, REST query URLs, hosted GeoJSON/KML/CSV, and other web-accessible GIS files (CORS must allow your browser).
                  </p>

                  <input
                    className="gis-input"
                    type="text"
                    value={layerName}
                    onChange={(e) => setLayerName(e.target.value)}
                    placeholder="Layer Name (optional)"
                    autoComplete="off"
                    aria-label="Layer Name (optional)"
                  />

                  {discoverError ? (
                    <div className="gis-inline-error" role="alert">
                      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                      <span>{discoverError}</span>
                    </div>
                  ) : null}

                  <button
                    className="gis-btn-primary-full"
                    type="button"
                    onClick={() => void addUrlLayerAsGeoJson()}
                    disabled={remoteDataUrl.trim() === '' || addingLayerKey === `url:${remoteDataUrl.trim()}`}
                  >
                    <i className="fa-solid fa-link" aria-hidden="true" />
                    {addingLayerKey === `url:${remoteDataUrl.trim()}` ? 'Importing…' : 'Import from URL'}
                  </button>
                </div>
              )}
            </div>

            <div className="gis-modal-footer">
              <button className="gis-link-btn" type="button" onClick={closeAddLayer}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fieldModal ? (
        <div className="gis-modal-overlay" role="presentation" onClick={closeFieldModal}>
          <div className="gis-modal gis-modal-compact" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="gis-modal-header">
              <div className="gis-modal-header-left">
                <div className="gis-modal-icon" aria-hidden="true">
                  <i className="fa-solid fa-list" aria-hidden="true" />
                </div>
                <div className="gis-modal-title">{fieldModal.mode === 'add' ? 'Add field' : 'Edit field'}</div>
              </div>
              <button className="gis-sidebar-close" type="button" onClick={closeFieldModal} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="gis-modal-body">
              <div className="gis-content-formgrid">
                <label className="gis-label">
                  Field name
                  <input
                    className={fieldError ? 'gis-input invalid' : 'gis-input'}
                    value={fieldDraft.name}
                    onChange={(e) => setFieldDraft(p => ({ ...p, name: e.target.value }))}
                  />
                </label>

                <label className="gis-label">
                  Data type
                  <div className="gis-content-selectwrap">
                    <select
                      className="gis-content-select"
                      value={fieldDraft.type}
                      onChange={(e) => setFieldDraft(p => ({ ...p, type: e.target.value as FieldType }))}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Boolean</option>
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </div>
                </label>

                <label className="gis-label">
                  Length (text)
                  <input
                    className="gis-input"
                    value={fieldDraft.length}
                    onChange={(e) => setFieldDraft(p => ({ ...p, length: e.target.value }))}
                    disabled={fieldDraft.type !== 'text'}
                    placeholder="Example: 50"
                  />
                </label>

                <label className="gis-label">
                  Default value
                  <input className="gis-input" value={fieldDraft.defaultValue} onChange={(e) => setFieldDraft(p => ({ ...p, defaultValue: e.target.value }))} />
                </label>

                <label className="gis-label">Nullable</label>
                <button
                  type="button"
                  className={fieldDraft.nullable ? 'gis-content-chip active' : 'gis-content-chip'}
                  aria-pressed={fieldDraft.nullable}
                  onClick={() => setFieldDraft(p => ({ ...p, nullable: !p.nullable }))}
                >
                  {fieldDraft.nullable ? 'Yes' : 'No'}
                </button>

                {fieldError ? <div className="gis-inline-error">{fieldError}</div> : null}
              </div>
            </div>
            <div className="gis-modal-actions">
              <button className="gis-btn" type="button" onClick={closeFieldModal}>
                Cancel
              </button>
              <button className="gis-btn gis-btn-primary" type="button" onClick={applyFieldSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {relModal ? (
        <div className="gis-modal-overlay" role="presentation" onClick={closeRelModal}>
          <div className="gis-modal gis-modal-compact gis-modal-relationship" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="gis-modal-header">
              <div className="gis-modal-header-left">
                <div className="gis-modal-icon" aria-hidden="true">
                  <i className="fa-solid fa-link" aria-hidden="true" />
                </div>
                <div className="gis-modal-title">{relModal.mode === 'add' ? 'Add relationship' : 'Edit relationship'}</div>
              </div>
              <button className="gis-sidebar-close" type="button" onClick={closeRelModal} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="gis-modal-body gis-modal-body-relationship">
              <div className="gis-content-formgrid gis-content-formgrid-relationship">
                <label className="gis-label">
                  Relationship name
                  <input
                    className={relError && !relDraft.name.trim() ? 'gis-input invalid' : 'gis-input'}
                    value={relDraft.name}
                    onChange={(e) => setRelDraft(p => ({ ...p, name: e.target.value }))}
                  />
                </label>

                <label className="gis-label">
                  Relationship type
                  <div className="gis-content-selectwrap">
                    <select
                      className="gis-content-select"
                      value={relDraft.type}
                      onChange={(e) => setRelDraft(p => ({ ...p, type: e.target.value as RelationshipType }))}
                    >
                      <option value="one-to-one">One-to-One</option>
                      <option value="one-to-many">One-to-Many</option>
                      <option value="many-to-many">Many-to-Many</option>
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </div>
                </label>

                <label className="gis-label">
                  Origin Layer
                  <div className="gis-content-selectwrap">
                    <select
                      className="gis-content-select"
                      value={relDraft.originLayerId}
                      onChange={(e) => setRelDraft(p => ({ ...p, originLayerId: e.target.value, originKey: '' }))}
                    >
                      <option value="">—</option>
                      {rows.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </div>
                </label>

                <label className="gis-label">
                  Destination Layer
                  <div className="gis-content-selectwrap">
                    <select
                      className="gis-content-select"
                      value={relDraft.destinationLayerId}
                      onChange={(e) => setRelDraft(p => ({ ...p, destinationLayerId: e.target.value, destinationKey: '' }))}
                    >
                      <option value="">—</option>
                      {rows.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </div>
                </label>

                <label className="gis-label">
                  Origin Key Field
                  <div className="gis-content-selectwrap">
                    <select
                      className="gis-content-select"
                      value={relDraft.originKey}
                      onChange={(e) => setRelDraft(p => ({ ...p, originKey: e.target.value }))}
                      disabled={!relDraft.originLayerId}
                    >
                      <option value="">—</option>
                      {relationshipKeyFieldsForLayer(relDraft.originLayerId).map(k => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </div>
                </label>

                <label className="gis-label">
                  Destination Key Field
                  <div className="gis-content-selectwrap">
                    <select
                      className="gis-content-select"
                      value={relDraft.destinationKey}
                      onChange={(e) => setRelDraft(p => ({ ...p, destinationKey: e.target.value }))}
                      disabled={!relDraft.destinationLayerId}
                    >
                      <option value="">—</option>
                      {relationshipKeyFieldsForLayer(relDraft.destinationLayerId).map(k => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </div>
                </label>

                {relDraft.type === 'many-to-many' ? (
                  <>
                    <label className="gis-label">
                      Junction Layer
                      <div className="gis-content-selectwrap">
                        <select
                          className="gis-content-select"
                          value={relDraft.junctionLayerId || ''}
                          onChange={(e) =>
                            setRelDraft(p => ({ ...p, junctionLayerId: e.target.value, originJunctionKey: '', destinationJunctionKey: '' }))
                          }
                        >
                          <option value="">—</option>
                          {rows.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                      </div>
                    </label>

                    <label className="gis-label">
                      Origin Junction Key
                      <div className="gis-content-selectwrap">
                        <select
                          className="gis-content-select"
                          value={relDraft.originJunctionKey || ''}
                          onChange={(e) => setRelDraft(p => ({ ...p, originJunctionKey: e.target.value }))}
                          disabled={!relDraft.junctionLayerId}
                        >
                          <option value="">—</option>
                          {relationshipKeyFieldsForLayer(relDraft.junctionLayerId || '').map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                      </div>
                    </label>

                    <label className="gis-label">
                      Destination Junction Key
                      <div className="gis-content-selectwrap">
                        <select
                          className="gis-content-select"
                          value={relDraft.destinationJunctionKey || ''}
                          onChange={(e) => setRelDraft(p => ({ ...p, destinationJunctionKey: e.target.value }))}
                          disabled={!relDraft.junctionLayerId}
                        >
                          <option value="">—</option>
                          {relationshipKeyFieldsForLayer(relDraft.junctionLayerId || '').map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                      </div>
                    </label>
                  </>
                ) : null}

                <label className="gis-label">Constraints</label>
                <div className="gis-content-row gis-content-row-constraints">
                  <button
                    type="button"
                    className={relDraft.enforce ? 'gis-content-chip active' : 'gis-content-chip'}
                    aria-pressed={!!relDraft.enforce}
                    onClick={() => setRelDraft(p => ({ ...p, enforce: !p.enforce }))}
                  >
                    Enforce
                  </button>
                  <button
                    type="button"
                    className={relDraft.cascadeDelete ? 'gis-content-chip active' : 'gis-content-chip'}
                    aria-pressed={!!relDraft.cascadeDelete}
                    onClick={() => setRelDraft(p => ({ ...p, cascadeDelete: !p.cascadeDelete }))}
                  >
                    Cascade Delete
                  </button>
                </div>

                {relError ? <div className="gis-inline-error">{relError}</div> : null}
              </div>
            </div>
            <div className="gis-modal-actions gis-modal-actions-relationship">
              <button className="gis-btn" type="button" onClick={closeRelModal}>
                Cancel
              </button>
              <button className="gis-btn gis-btn-primary" type="button" onClick={saveRelationship}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="gis-modal-overlay"
          role="presentation"
          onClick={() => {
            setConfirm(null)
          }}
        >
          <div className="gis-modal gis-modal-compact" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="gis-modal-header">
              <div className="gis-modal-header-left">
                <div className="gis-modal-icon" aria-hidden="true">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                </div>
                <div className="gis-modal-title">Confirm</div>
              </div>
              <button className="gis-sidebar-close" type="button" onClick={() => setConfirm(null)} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="gis-modal-body">
              <div className="gis-content-confirmtext">
                {confirm.kind === 'deleteLayer'
                  ? 'Delete this layer? Related relationships will also be removed.'
                  : confirm.kind === 'deleteField'
                    ? 'Delete this field? It will be removed from all records.'
                    : 'Delete this relationship?'}
              </div>
            </div>
            <div className="gis-modal-actions">
              <button className="gis-btn" type="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="gis-btn gis-btn-primary"
                type="button"
                onClick={() => {
                  if (confirm.kind === 'deleteLayer') applyDeleteLayer(confirm.layerId)
                  if (confirm.kind === 'deleteField') applyDeleteField(confirm.layerId, confirm.fieldId)
                  if (confirm.kind === 'deleteRelationship') setRelationships(prev => prev.filter(r => r.id !== confirm.id))
                  setConfirm(null)
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="gis-modal-overlay" role="presentation" onClick={() => setHelpOpen(false)}>
          <div className="gis-modal gis-modal-compact gis-modal-docs-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="gis-modal-header">
              <div className="gis-modal-header-left">
                <div className="gis-modal-icon" aria-hidden="true">
                  <i className="fa-solid fa-circle-info" aria-hidden="true" />
                </div>
                <div className="gis-modal-title">Features and UI documentation</div>
              </div>
              <button className="gis-sidebar-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="gis-modal-body">
              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">Goal</div>
                <div>This page manages GIS layers in a tabular format (no map), including fields and relationships.</div>
              </div>

              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">Layers (CRUD)</div>
                <div>Add (upload GeoJSON or connect ArcGIS), rename, delete with confirmation, show/hide, reorder priority (↑/↓), or sort by name/date.</div>
              </div>

              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">Fields (CRUD)</div>
                <div>Add/edit/delete with name validation, and reorder via drag-and-drop. Field add/delete/rename is applied to each GeoJSON feature’s properties.</div>
              </div>

              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">Relationships</div>
                <div>
                  In this app, define one-to-one, one-to-many, or many-to-many links between layers (origin / destination / optional junction), choose key fields, and inspect them in the{' '}
                  <strong>Relationships</strong> tab (list + tree). Storage is local (workflow aid).
                </div>
              </div>

              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">Relationship classes (concept)</div>
                <div className="gis-docs-prose">
                  <p>
                    A <strong>relationship class</strong> stores an association between fields or features in an <strong>origin</strong> table or feature class and a{' '}
                    <strong>destination</strong> table or feature class.
                  </p>
                  <p>
                    <strong>Usage.</strong> Relationships can exist between spatial objects (features), nonspatial objects (table rows), or a mix of spatial and nonspatial objects.
                  </p>
                  <p>
                    Once created in an enterprise geodatabase, a relationship class typically cannot be structurally rewritten—you add, delete, or refine rules. (Here we keep an editable local list for prototyping.)
                  </p>
                  <p>
                    <strong>Many-to-many.</strong> A junction table holds foreign keys linking origin and destination; it may carry attributes of the relationship that belong neither solely to the origin nor the destination—e.g. a parcels↔owners association might record <em>percentage ownership</em>. One-to-one and one-to-many classes can also be attributed; a table then stores those relationships.
                  </p>
                  <p>
                    <strong>Simple (peer-to-peer).</strong> Related objects exist independently—for example railroad crossings and signal lamps: either may exist without the other. Cardinality may be one-to-one, one-to-many, or many-to-many.
                  </p>
                  <p>
                    <strong>Composite.</strong> One object&apos;s lifetime controls related objects—e.g. poles support transformers; deleting a pole propagates deletes to mounted transformers. Composite relationships are always one-to-many.
                  </p>
                  <p>
                    <strong>Path labels.</strong> The <em>forward</em> label describes navigation from origin to destination (e.g. &quot;Poles support transformers&quot;); the <em>backward</em> label describes destination → origin (e.g. &quot;Transformers are mounted on poles&quot;).
                  </p>
                  <p className="gis-docs-prose-note">
                    Educational text follows common ArcGIS geodatabase relationship-class terminology; behavior here is simplified for browser-side workflows.
                  </p>
                </div>
              </div>

              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">ArcGIS APIs used (client-side)</div>
                <div>
                  Discover: <span dir="ltr">GET {`{serviceUrl}`}?f=json&amp;token=...</span>
                </div>
                <div>
                  Layer Definition: <span dir="ltr">GET {`{layerUrl}`}?f=json&amp;token=...</span>
                </div>
                <div>
                  Query GeoJSON: <span dir="ltr">GET {`{layerUrl}`}/query?where=1%3D1&amp;outFields=*&amp;returnGeometry=true&amp;outSR=4326&amp;f=geojson&amp;token=...</span>
                </div>
              </div>

              <div className="gis-content-confirmtext">
                <div className="gis-content-muted">Storage</div>
                <div dir="ltr">
                  IndexedDB: {DB_NAME} / {STORE_NAME} / key=savedLayers
                </div>
                <div dir="ltr">
                  localStorage: {LS_META_KEY}, {LS_ORDER_KEY}, {LS_FIELDS_KEY}, {LS_RELATIONSHIPS_KEY}, {LS_HIDDEN_FIELDS_KEY}
                </div>
              </div>
            </div>
            <div className="gis-modal-actions">
              <button className="gis-btn" type="button" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
