import { useEffect, useState } from 'react'
import { matrixRowDisplayLabel } from '../../lib/rbac/rbacRoleCatalog'
import { sortRbacMatrixRows, type RbacMatrixRow } from '../../lib/rbac/rbacMatrixRoles'
import { apiPermissionsMatrix } from '../../lib/rbacApi'

export default function AdminRolesPage() {
  const [matrix, setMatrix] = useState<RbacMatrixRow[]>([])

  useEffect(() => {
    void apiPermissionsMatrix().then(rows => setMatrix(sortRbacMatrixRows(rows)))
  }, [])

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Roles & permissions</h1>
        <p className="admin-page__lead">Effective permissions per role (enforced on the server).</p>
      </header>
      <div className="admin-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map(row => (
              <tr key={row.role}>
                <td>
                  <strong>{matrixRowDisplayLabel(row.role)}</strong>
                  <br />
                  <code className="admin-role-slug">{row.role}</code>
                </td>
                <td>
                  <ul className="admin-perm-list">
                    {row.permissions.map(p => (
                      <li key={p}>
                        <code>{p}</code>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
