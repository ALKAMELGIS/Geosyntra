import { useRef, useState } from 'react'
import { applyAdminDirectorySnapshotImport } from '../../../lib/admin/adminDirectoryBootstrap'
import { appAlert } from '../../../lib/appDialog'
import { exportAdminDirectoryJsonBackup } from '../../../lib/admin/adminUserStore'
import {
  flushAdminDirectoryToServerNow,
  getAdminDirectorySyncState,
} from '../../../lib/adminDirectoryPersistence'

type Props = {
  onSynced: () => void
}

export function AdminDirectoryDataPanel({ onSynced }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const sync = getAdminDirectorySyncState()

  const syncNow = async () => {
    setBusy(true)
    try {
      const ok = await flushAdminDirectoryToServerNow()
      onSynced()
      if (!ok) {
        await appAlert('Could not sync to server. Check directory API URL/token or use JSON backup.', {
          title: 'Sync failed',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const onRestoreFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await applyAdminDirectorySnapshotImport(file)
      if (result.ok) await flushAdminDirectoryToServerNow()
      onSynced()
      await appAlert(result.message, { title: result.ok ? 'Restore complete' : 'Restore failed' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="admin-data-health" aria-label="Directory data protection">
      <div className="admin-data-health__copy">
        <strong>SaaS directory durability</strong>
        <span>
          Accounts sync to the server store when configured. Export JSON before upgrades; restores merge
          users, audit log, and removal tombstones.
        </span>
      </div>
      <div className="admin-data-health__meta">
        <span className={sync.serverReachable ? 'admin-data-health__pill admin-data-health__pill--ok' : 'admin-data-health__pill'}>
          {sync.serverReachable ? 'Server reachable' : 'Local only / server offline'}
        </span>
        {sync.lastPushedAt ? (
          <span className="admin-data-health__pill">Last push {new Date(sync.lastPushedAt).toLocaleString()}</span>
        ) : null}
        {sync.lastError ? (
          <span className="admin-data-health__pill admin-data-health__pill--warn">Sync: {sync.lastError}</span>
        ) : null}
      </div>
      <div className="admin-data-health__actions">
        <button type="button" className="admin-btn" disabled={busy} onClick={() => exportAdminDirectoryJsonBackup()}>
          Export JSON backup
        </button>
        <button type="button" className="admin-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          Restore from JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="admin-data-health__file"
          onChange={e => void onRestoreFile(e.target.files?.[0])}
        />
        <button type="button" className="admin-btn admin-btn--primary" disabled={busy} onClick={() => void syncNow()}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
    </section>
  )
}
