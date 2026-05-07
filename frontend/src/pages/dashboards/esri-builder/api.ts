import type { EsriDashboardSchema, EsriDataSource } from './types'

export async function saveDashboard(schema: EsriDashboardSchema): Promise<{ id: string; revision: number }> {
  const res = await fetch('/api/esri-dashboards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema),
  })
  if (!res.ok) throw new Error('Failed to save dashboard')
  return res.json()
}

export async function listDashboards(): Promise<Array<{ id: string; title: string; updatedAt: string; revision: number }>> {
  const res = await fetch('/api/esri-dashboards')
  if (!res.ok) throw new Error('Failed to fetch dashboards')
  return res.json()
}

export async function loadDashboard(id: string): Promise<EsriDashboardSchema> {
  const res = await fetch(`/api/esri-dashboards/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Failed to load dashboard')
  return res.json()
}

export async function probeSource(source: EsriDataSource): Promise<{ ok: boolean; columns: string[]; count: number }> {
  const res = await fetch('/api/esri-dashboards/sources/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  })
  if (!res.ok) throw new Error('Source probe failed')
  return res.json()
}
