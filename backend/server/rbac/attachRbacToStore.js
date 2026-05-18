import {
  USER_STATUSES,
  canAssignRole,
  displayRoleToSlug,
  normalizeRbacRole,
  rbacRoleToDisplay,
} from './roles.js'
import { toPublicAuthUser } from './userPublic.js'

/**
 * @param {object} base - sqlite/json store methods
 * @param {{ mutateUsers: (fn: (users: object[], auditLog: object[]) => { users: object[], auditLog: object[], result?: unknown }) => unknown, getUsers: () => object[], getAudit: () => object[] }} io
 */
export function attachRbacToStore(base, io) {
  function findUserById(users, id) {
    const n = Number(id)
    return users.find(u => Number(u.id) === n) ?? null
  }

  return {
    ...base,
    getUserById(id) {
      return findUserById(io.getUsers(), id)
    },
    listUsers() {
      return io.getUsers()
    },
    getAuditLog(limit = 200) {
      const log = io.getAudit()
      return log.slice(-limit).reverse()
    },
    approveUser(targetId, actor) {
      return io.mutateUsers((users, auditLog) => {
        const u = findUserById(users, targetId)
        if (!u) return { users, auditLog, result: { ok: false, error: 'not_found' } }
        const next = users.map(row =>
          row.id === u.id
            ? { ...row, status: USER_STATUSES.ACTIVE, updatedAt: new Date().toISOString() }
            : row,
        )
        const auditLog2 = io.appendAudit(auditLog, {
          actor: actor?.email ?? null,
          action: 'user_approved',
          target: u.email,
          details: { userId: u.id },
        })
        return {
          users: next,
          auditLog: auditLog2,
          result: { ok: true, user: { ...u, status: USER_STATUSES.ACTIVE } },
        }
      }).result
    },
    suspendUser(targetId, actor) {
      return io.mutateUsers((users, auditLog) => {
        const u = findUserById(users, targetId)
        if (!u) return { users, auditLog, result: { ok: false, error: 'not_found' } }
        const next = users.map(row =>
          row.id === u.id ? { ...row, status: USER_STATUSES.SUSPENDED } : row,
        )
        const auditLog2 = io.appendAudit(auditLog, {
          actor: actor?.email ?? null,
          action: 'user_suspended',
          target: u.email,
        })
        return { users: next, auditLog: auditLog2, result: { ok: true } }
      }).result
    },
    reactivateUser(targetId, actor) {
      return io.mutateUsers((users, auditLog) => {
        const u = findUserById(users, targetId)
        if (!u) return { users, auditLog, result: { ok: false, error: 'not_found' } }
        const next = users.map(row =>
          row.id === u.id ? { ...row, status: USER_STATUSES.ACTIVE } : row,
        )
        const auditLog2 = io.appendAudit(auditLog, {
          actor: actor?.email ?? null,
          action: 'user_reactivated',
          target: u.email,
        })
        return { users: next, auditLog: auditLog2, result: { ok: true } }
      }).result
    },
    setUserRole(targetId, roleSlug, actor) {
      const actorSlug = normalizeRbacRole(actor?.roleSlug || displayRoleToSlug(actor?.role))
      const targetSlug = normalizeRbacRole(roleSlug)
      if (!canAssignRole(actorSlug, targetSlug)) {
        return { ok: false, error: 'forbidden_role_assignment' }
      }
      return io.mutateUsers((users, auditLog) => {
        const u = findUserById(users, targetId)
        if (!u) return { users, auditLog, result: { ok: false, error: 'not_found' } }
        const display = rbacRoleToDisplay(targetSlug)
        const next = users.map(row => (row.id === u.id ? { ...row, role: display } : row))
        const auditLog2 = io.appendAudit(auditLog, {
          actor: actor?.email ?? null,
          action: 'role_changed',
          target: u.email,
          details: { from: u.role, to: display },
        })
        return { users: next, auditLog: auditLog2, result: { ok: true, user: { ...u, role: display } } }
      }).result
    },
    createInvitedUser({ email, name, password, roleDisplay, invitedByEmail }) {
      const em = String(email || '').trim().toLowerCase()
      if (base.getUserByEmail(em)) return { ok: false, error: 'email_exists' }
      return io.mutateUsers((users, auditLog) => {
        let max = 0
        for (const u of users) {
          const id = Number(u.id)
          if (Number.isFinite(id) && id > max) max = id
        }
        const id = max + 1
        const ts = new Date().toISOString()
        const user = {
          id,
          email: em,
          name: String(name || em).trim(),
          role: roleDisplay,
          status: USER_STATUSES.ACTIVE,
          lastLogin: 'Never',
          passwordHash: typeof base.hashPassword === 'function' ? base.hashPassword(password) : undefined,
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpires: null,
          createdAt: ts,
          profileExtra: { invitedBy: invitedByEmail },
        }
        const auditLog2 = io.appendAudit(auditLog, {
          actor: invitedByEmail ?? null,
          action: 'invite_accepted',
          target: em,
          details: { role: roleDisplay },
        })
        return {
          users: [...users, user],
          auditLog: auditLog2,
          result: { ok: true, user },
        }
      }).result
    },
    toPublicAuthUser,
  }
}
