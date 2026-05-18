import { useEffect, useState } from 'react'
import { apiRbacAudit } from '../../lib/rbacApi'

type AuditRow = {
  at?: string
  actor?: string | null
  action?: string
  target?: string | null
  details?: unknown
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])

  useEffect(() => {
    void apiRbacAudit(200).then(list => setRows(list as AuditRow[]))
  }, [])

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Audit log</h1>
        <p className="admin-page__lead">Recent security and administration events.</p>
      </header>
      <div className="admin-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.at}-${i}`}>
                <td>{row.at ? new Date(row.at).toLocaleString() : '—'}</td>
                <td>{row.actor || '—'}</td>
                <td>{row.action || '—'}</td>
                <td>{row.target || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
