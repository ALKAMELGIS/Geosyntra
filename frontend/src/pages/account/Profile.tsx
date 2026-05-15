import { useEffect, useMemo, useState } from 'react'
import { normalizeEmail, readCurrentUser } from '../../lib/auth'
import { readProfileExtra } from '../../lib/userProfilePersistence'

type AdminRow = {
  id?: number
  name?: string
  email?: string
  role?: string
  status?: string
  scope?: string
  createdAt?: string
  lastLogin?: string
  emailVerified?: boolean
  profileExtra?: Record<string, unknown>
}

function readAdminRowForEmail(emailKey: string): AdminRow | null {
  try {
    const raw = localStorage.getItem('adminUsers')
    if (!raw) return null
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return null
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue
      const r = row as AdminRow
      if (normalizeEmail(String(r.email || '')) === emailKey) return r
    }
    return null
  } catch {
    return null
  }
}

/**
 * Account profile — read-only view kept in sync with the signed-in session and
 * the User Management directory row (same source as admin Users table).
 */
export default function Profile() {
  const session = readCurrentUser()
  const emailKey = session?.email ? normalizeEmail(session.email) : ''
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick(n => n + 1)
    window.addEventListener('storage', bump)
    return () => window.removeEventListener('storage', bump)
  }, [])

  const directory = useMemo(() => (emailKey ? readAdminRowForEmail(emailKey) : null), [emailKey, tick])
  const extra = session?.email ? readProfileExtra(session.email) : {}

  const displayName =
    directory?.name?.trim() ||
    [extra.firstName, extra.lastName].filter(Boolean).join(' ').trim() ||
    session?.name ||
    session?.email ||
    '—'

  const firstName = extra.firstName?.trim() || '—'
  const lastName = extra.lastName?.trim() || '—'
  const role = directory?.role || session?.role || '—'
  const status = directory?.status || '—'
  const scope = directory?.scope || session?.scope || '—'
  const createdAt = directory?.createdAt || '—'
  const lastLogin = directory?.lastLogin || '—'
  const verified =
    directory?.emailVerified === true ? 'Yes' : directory?.emailVerified === false ? 'No' : '—'

  if (!session) {
    return (
      <div className="page page-tight" style={{ padding: 'clamp(20px, 4vw, 32px)' }}>
        <p style={{ color: 'var(--ds-color-text-muted)' }}>Sign in to view your profile.</p>
      </div>
    )
  }

  return (
    <div className="page page-tight" style={{ padding: 'clamp(20px, 4vw, 32px)', maxWidth: 720, marginInline: 'auto' }}>
      <h1 style={{ fontSize: '1.25rem', margin: '0 0 8px', color: 'var(--ds-color-text)' }}>Profile</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ds-color-text-muted)' }}>
        Read-only summary — data matches User Management and your session. Edit users in{' '}
        <strong>Admin → User Management</strong>; profile fields (first/last name, etc.) sync via directory{' '}
        <code style={{ fontSize: 12 }}>profileExtra</code>.
      </p>
      <div
        style={{
          display: 'grid',
          gap: 12,
          padding: 16,
          borderRadius: 16,
          border: '1px solid var(--ds-color-border)',
          background: 'color-mix(in srgb, var(--ds-color-surface) 90%, transparent)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px', fontSize: 14 }}>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Display name</span>
          <span style={{ fontWeight: 600 }}>{displayName}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>First name</span>
          <span>{firstName}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Last name</span>
          <span>{lastName}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Email</span>
          <span>{session.email}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Role</span>
          <span>{role}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Status</span>
          <span>{status}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Scope</span>
          <span>{scope}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Directory ID</span>
          <span>{directory?.id ?? session.id}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Created</span>
          <span>{createdAt}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Last login</span>
          <span>{lastLogin}</span>
          <span style={{ color: 'var(--ds-color-text-muted)' }}>Email verified</span>
          <span>{verified}</span>
        </div>
      </div>
    </div>
  )
}
