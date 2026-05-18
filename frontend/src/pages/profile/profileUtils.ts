export function formatProfileDate(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function profileUsernameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? 'user').trim().toLowerCase()
  const safe = local.replace(/[^a-z0-9._-]/g, '')
  return safe || 'user'
}

export function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 48) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch {
    return iso
  }
}
