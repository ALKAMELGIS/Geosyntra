import {
  USER_STATUSES,
  canAssignRole,
  displayRoleToSlug,
  normalizeRbacRole,
  rbacRoleToDisplay,
} from './roles.js'
import { isSystemOwnerEmail } from './systemOwnerEmails.js'
import { toPublicAuthUser } from './userPublic.js'
import { storeAwait } from '../storeAwait.js'

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function countOwners(users) {
  let n = 0
  for (const u of users) {
    const slug = displayRoleToSlug(u.role)
    if (slug === 'owner' || slug === 'super_admin') n += 1
  }
  return n
}

/**
 * @param {object} base - sqlite/json/postgres store methods
 * @param {{ mutateUsers: (fn: (users: object[], auditLog: object[]) => { users: object[], auditLog: object[], result?: unknown }) => unknown, getUsers: () => object[] | Promise<object[]>, getAudit: () => object[] | Promise<object[]>, appendAudit: (log: object[], entry: object) => object[] }} io
 */
export function attachRbacToStore(base, io) {
  function findUserById(users, id) {
    const n = Number(id)
    return users.find(u => Number(u.id) === n) ?? null
  }

  async function loadUsers() {
    return storeAwait(io.getUsers())
  }

  async function loadAudit() {
    return storeAwait(io.getAudit())
  }

  async function runMutate(fn) {
    return storeAwait(io.mutateUsers(fn))
  }

  return {
    ...base,
    async getUserById(id) {
      return findUserById(await loadUsers(), id)
    },
    async listUsers() {
      return loadUsers()
    },
    async getAuditLog(limit = 200) {
      const log = await loadAudit()
      return log.slice(-limit).reverse()
    },
    async approveUser(targetId, actor) {
      const out = await runMutate((users, auditLog) => {
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
      })
      return out.result
    },
    async suspendUser(targetId, actor) {
      const out = await runMutate((users, auditLog) => {
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
      })
      return out.result
    },
    async reactivateUser(targetId, actor) {
      const out = await runMutate((users, auditLog) => {
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
      })
      return out.result
    },
    async setUserRole(targetId, roleSlug, actor) {
      const actorSlug = normalizeRbacRole(actor?.roleSlug || displayRoleToSlug(actor?.role))
      const targetSlug = normalizeRbacRole(roleSlug)
      if (!canAssignRole(actorSlug, targetSlug)) {
        return { ok: false, error: 'forbidden_role_assignment' }
      }
      const out = await runMutate((users, auditLog) => {
        const u = findUserById(users, targetId)
        if (!u) return { users, auditLog, result: { ok: false, error: 'not_found' } }
        const display = rbacRoleToDisplay(targetSlug)
        const next = users.map(row => {
          if (row.id !== u.id) return row
          const profileExtra =
            row.profileExtra && typeof row.profileExtra === 'object'
              ? { ...row.profileExtra, roleSlug: targetSlug }
              : { roleSlug: targetSlug }
          return { ...row, role: display, profileExtra }
        })
        const auditLog2 = io.appendAudit(auditLog, {
          actor: actor?.email ?? null,
          action: 'role_changed',
          target: u.email,
          details: { from: u.role, to: display },
        })
        return { users: next, auditLog: auditLog2, result: { ok: true, user: { ...u, role: display } } }
      })
      return out.result
    },
    async deleteUser(targetId, actor) {
      const out = await runMutate((users, auditLog) => {
        const u = findUserById(users, targetId)
        if (!u) return { users, auditLog, result: { ok: false, error: 'not_found' } }
        if (Number(actor?.id) === Number(u.id)) {
          return { users, auditLog, result: { ok: false, error: 'cannot_delete_self' } }
        }
        const em = normalizeEmail(u.email)
        if (isSystemOwnerEmail(em)) {
          return { users, auditLog, result: { ok: false, error: 'protected_account' } }
        }
        const slug = displayRoleToSlug(u.role)
        if ((slug === 'owner' || slug === 'super_admin') && countOwners(users) <= 1) {
          return { users, auditLog, result: { ok: false, error: 'last_owner' } }
        }
        const next = users.filter(row => Number(row.id) !== Number(u.id))
        const auditLog2 = io.appendAudit(auditLog, {
          actor: actor?.email ?? null,
          action: 'user_deleted',
          target: em,
          details: { userId: u.id },
        })
        return {
          users: next,
          auditLog: auditLog2,
          deletedEmails: [em],
          result: { ok: true, email: em },
        }
      })
      return out.result
    },
    async createInvitedUser({ email, name, password, roleDisplay, invitedByEmail }) {
      const em = String(email || '').trim().toLowerCase()
      if (await storeAwait(base.getUserByEmail(em))) return { ok: false, error: 'email_exists' }
      const out = await runMutate((users, auditLog) => {
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
      })
      return out.result
    },
    toPublicAuthUser,
  }
}
