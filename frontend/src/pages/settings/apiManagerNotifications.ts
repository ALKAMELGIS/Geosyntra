export type ApiManagerNoticeTone = 'ok' | 'warn' | 'info'

export type ApiManagerNotice = {
  id: string
  tone: ApiManagerNoticeTone
  icon: string
  title: string
  priority: number
}

const DISMISSED_STORAGE_KEY = 'geosyntra-api-manager-notices-dismissed-v1'

export function loadDismissedApiManagerNoticeIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim()))
  } catch {
    return new Set()
  }
}

export function persistDismissedApiManagerNoticeIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore quota */
  }
}

export function clearDismissedApiManagerNoticeIds(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DISMISSED_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
