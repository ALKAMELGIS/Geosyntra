/**
 * Auth-facing user directory — SQLite (preferred) or JSON file fallback.
 */
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { createSqliteAdminDirectoryStore } from './sqliteAdminDirectoryStore.js'
import { createAdminDirectoryStore } from './adminDirectoryStore.js'
import {
  generateVerificationToken,
  isPasswordResetExpired,
  isVerificationExpired,
  passwordResetExpiresAt,
  verificationExpiresAt,
} from './authVerification.js'
import { attachRbacToStore } from './rbac/attachRbacToStore.js'
import { PUBLIC_SIGNUP_ROLE, resolveSignupRole, USER_STATUSES } from './rbac/roles.js'
import { resolveSignupPlan } from './rbac/signupPlans.js'
import { canLoginUser, statusAfterEmailVerify, toPublicAuthUser } from './rbac/userPublic.js'
import { applySystemOwnerToDirectoryUser } from './rbac/systemOwnerUser.js'
import { isSystemOwnerEmail } from './rbac/systemOwnerEmails.js'
import { createOAuthUserService } from './oauth/oauthUserService.js'

function appendAuditEntry(auditLog, entry) {
  const row = {
    at: new Date().toISOString(),
    actor: entry.actor ?? null,
    action: String(entry.action || 'event'),
    target: entry.target ?? null,
    details: entry.details ?? undefined,
  }
  const next = [...(Array.isArray(auditLog) ? auditLog : []), row]
  return next.slice(-80000)
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase()
}

function isLegacySha256Hex(s) {
  return s.length === 64 && /^[0-9a-f]+$/i.test(s)
}

function emptyStore() {
  return { version: 1, updatedAt: null, users: [], auditLog: [] }
}

function readJsonStore(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { persisted: false, data: emptyStore() }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!raw || typeof raw !== 'object') return { persisted: true, data: emptyStore() }
    return {
      persisted: true,
      data: {
        version: 1,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        users: Array.isArray(raw.users) ? raw.users : [],
        auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
      },
    }
  } catch {
    return { persisted: false, data: emptyStore() }
  }
}

function writeJsonStore(filePath, data) {
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: Array.isArray(data.users) ? data.users : [],
    auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
}

function nextUserId(users) {
  let max = 0
  for (const u of users) {
    const id = Number(u?.id)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max + 1
}

function checkPassword(storedHash, plain) {
  const hash = String(storedHash || '')
  const pwd = String(plain || '')
  if (!hash || !pwd) return false
  if (hash.startsWith('$2')) return bcrypt.compareSync(pwd, hash)
  if (isLegacySha256Hex(hash)) {
    const hex = createHash('sha256').update(pwd).digest('hex')
    return hex === hash
  }
  return false
}

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain || ''), 12)
}

function parseProfileExtra(user) {
  return user?.profileExtra && typeof user.profileExtra === 'object' ? { ...user.profileExtra } : {}
}

function userWithPasswordReset(user, token, expiresAt) {
  const extra = parseProfileExtra(user)
  if (!token) {
    delete extra.passwordResetToken
    delete extra.passwordResetExpires
  } else {
    extra.passwordResetToken = token
    extra.passwordResetExpires = expiresAt
  }
  const profileExtra = Object.keys(extra).length ? extra : undefined
  return { ...user, profileExtra }
}

function findUserByPasswordResetToken(users, token) {
  const t = String(token || '').trim()
  if (!t) return null
  return users.find(u => String(parseProfileExtra(u).passwordResetToken || '') === t) || null
}

function usernameHintFromUser(user) {
  if (!user) return { ok: false, error: 'not_found' }
  const extra = parseProfileExtra(user)
  const em = normalizeEmail(user.email)
  const displayUsername = String(user.username || extra.username || '').trim() || em
  const hasPassword = Boolean(String(user.passwordHash || '').trim())
  const oauthProviders = Array.isArray(extra.oauthProviders)
    ? [...extra.oauthProviders]
    : []
  if (user.oauthGoogleSub && !oauthProviders.includes('google')) oauthProviders.push('google')
  if (user.oauthAppleSub && !oauthProviders.includes('apple')) oauthProviders.push('apple')
  const oauthOnly = !hasPassword && oauthProviders.length > 0
  return {
    ok: true,
    signInId: em,
    username: displayUsername,
    oauthOnly,
    oauthProviders,
    hasPassword,
  }
}

function oauthUpsertFromDirectory(dir, payload, nextId) {
  const oauthSvc = createOAuthUserService({
    users: dir.users,
    findByEmail: em => dir.users.find(u => normalizeEmail(u.email) === normalizeEmail(em)) || null,
  })
  const result = oauthSvc.upsertOAuthUser(payload)
  if (!result.ok) return result
  let user = result.user
  if (!user.id) user = { ...user, id: nextId() }
  const idx = dir.users.findIndex(u => Number(u.id) === Number(user.id))
  const users = idx >= 0 ? dir.users.map((u, i) => (i === idx ? user : u)) : [...dir.users, user]
  return { ...result, user, users }
}

/**
 * @param {{ platformDb?: import('./platformDatabase.js').resolvePlatformStoreDb extends Function ? Parameters<typeof import('./platformDatabase.js').resolvePlatformStoreDb>[0] : any, sqlitePath?: string, jsonFilePath: string }} opts
 */
export async function createAuthDirectoryStore(opts) {
  const jsonFilePath = opts.jsonFilePath
  const platformDb = opts.platformDb ?? opts.sqlitePath ?? null
  const adminStore = await createAdminDirectoryStore(platformDb)

  if (adminStore) {
    async function mutateUsers(fn) {
      const dir = await adminStore.readDirectory()
      const out = fn(dir.users, dir.auditLog || [])
      const payload = { users: out.users, auditLog: out.auditLog }
      if (Array.isArray(out.deletedEmails) && out.deletedEmails.length) {
        payload.deletedEmails = out.deletedEmails
      }
      await adminStore.writeDirectory(payload)
      return out
    }

    const dbBase = {
      storage: adminStore.dialect === 'postgres' ? 'postgres' : 'sqlite',
      hashPassword,
      async getUserByEmail(email) {
        return adminStore.getUserRowByEmail(normalizeEmail(email))
      },
      async getUserByVerificationToken(token) {
        return adminStore.getUserRowByVerificationToken(token)
      },
      async registerUser({ name, email, password, profileExtra, requestedRole, requestedPlan }) {
        const em = normalizeEmail(email)
        if (await adminStore.getUserRowByEmail(em)) return { ok: false, error: 'email_exists' }
        const planResolved = resolveSignupPlan(requestedPlan ?? profileExtra?.billingPlanId ?? profileExtra?.signupPlan)
        const roleResolved = resolveSignupRole(PUBLIC_SIGNUP_ROLE)
        if (!roleResolved.ok) return { ok: false, error: roleResolved.error }
        const id = (await adminStore.getMaxUserId()) + 1
        const ts = new Date().toISOString()
        const token = generateVerificationToken()
        const expires = verificationExpiresAt()
        const user = {
          id,
          email: em,
          name: String(name || em).trim(),
          role: roleResolved.display,
          plan: planResolved.adminPlan,
          status: USER_STATUSES.PENDING_VERIFICATION,
          lastLogin: 'Never',
          passwordHash: hashPassword(password),
          emailVerified: false,
          verificationToken: token,
          verificationTokenExpires: expires,
          createdAt: ts,
          profileExtra: {
            ...(profileExtra || {}),
            roleSlug: roleResolved.slug,
            billingPlanId: planResolved.planId,
            subscriptionPlan: planResolved.subscriptionPlan,
            signupPlan: planResolved.planId,
          },
        }
        const dir = await adminStore.readDirectory()
        const auditLog = appendAuditEntry(dir.auditLog, {
          actor: em,
          action: 'user_registered',
          target: em,
          details: {
            status: 'Pending Verification',
            role: roleResolved.display,
            roleSlug: roleResolved.slug,
            plan: planResolved.adminPlan,
            billingPlanId: planResolved.planId,
          },
        })
        await adminStore.writeDirectory({ users: [...dir.users, user], auditLog })
        return { ok: true, user, verificationToken: token, verificationTokenExpires: expires }
      },
      async verifyEmailByToken(token) {
        const u = await adminStore.getUserRowByVerificationToken(String(token || '').trim())
        if (!u || !u.verificationToken) return { ok: false, error: 'invalid_token' }
        if (isVerificationExpired(u.verificationTokenExpires)) {
          return { ok: false, error: 'token_expired' }
        }
        const dir = await adminStore.readDirectory()
        const nextStatus = statusAfterEmailVerify(u.role)
        const users = dir.users.map(row => {
          if (row.id !== u.id) return row
          return {
            ...row,
            emailVerified: true,
            status: nextStatus,
            verificationToken: null,
            verificationTokenExpires: null,
            updatedAt: new Date().toISOString(),
          }
        })
        const auditLog = appendAuditEntry(dir.auditLog, {
          actor: u.email,
          action: 'email_verified',
          target: u.email,
          details: { status: nextStatus },
        })
        await adminStore.writeDirectory({ users, auditLog })
        const verified = { ...u, emailVerified: true, status: nextStatus, verificationToken: undefined }
        return { ok: true, user: verified, publicUser: toPublicAuthUser(verified) }
      },
      async loginUser(email, password) {
        const u = await adminStore.getUserRowByEmail(normalizeEmail(email))
        if (!u) return { ok: false, error: 'user_not_found' }
        if (!String(u.passwordHash || '').trim()) {
          return {
            ok: false,
            error: 'auth_incomplete',
            message: 'Account exists but is not activated for sign-in. Contact your administrator.',
          }
        }
        if (!checkPassword(u.passwordHash, password)) return { ok: false, error: 'invalid_password' }
        const gate = canLoginUser(u)
        if (!gate.ok) return { ok: false, error: gate.error, message: gate.message }
        const ts = new Date().toISOString()
        const dir = await adminStore.readDirectory()
        const users = dir.users.map(row => (row.id === u.id ? { ...row, lastLogin: ts } : row))
        await adminStore.writeDirectory({ users, auditLog: dir.auditLog })
        const fresh = { ...u, lastLogin: ts }
        return { ok: true, user: fresh, publicUser: toPublicAuthUser(fresh) }
      },
      async lookupUsernameHint(email) {
        return usernameHintFromUser(await adminStore.getUserRowByEmail(normalizeEmail(email)))
      },
      sqliteDb: adminStore.db || null,
      adminStore,
    }

    return attachRbacToStore(dbBase, {
      getUsers: async () => (await adminStore.readDirectory()).users,
      getAudit: async () => (await adminStore.readDirectory()).auditLog || [],
      appendAudit: (log, entry) => appendAuditEntry(log, entry),
      mutateUsers: fn => mutateUsers(fn),
    })
  }

  /* JSON file fallback */
  function jsonMutateUsers(fn) {
    const { data } = readJsonStore(jsonFilePath)
    const out = fn(data.users, data.auditLog || [])
    writeJsonStore(jsonFilePath, { ...data, users: out.users, auditLog: out.auditLog })
    return out
  }

  const jsonBase = {
    storage: 'json',
    hashPassword,
    getUserByEmail(email) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      return data.users.find(u => normalizeEmail(u.email) === em) || null
    },
    getUserByVerificationToken(token) {
      const { data } = readJsonStore(jsonFilePath)
      const t = String(token || '').trim()
      return data.users.find(u => String(u.verificationToken || '') === t) || null
    },
    registerUser({ name, email, password, profileExtra, requestedRole, requestedPlan }) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      if (data.users.some(u => normalizeEmail(u.email) === em)) return { ok: false, error: 'email_exists' }
      const planResolved = resolveSignupPlan(requestedPlan ?? profileExtra?.billingPlanId ?? profileExtra?.signupPlan)
      const roleResolved = resolveSignupRole(PUBLIC_SIGNUP_ROLE)
      if (!roleResolved.ok) return { ok: false, error: roleResolved.error }
      const token = generateVerificationToken()
      const expires = verificationExpiresAt()
      const user = {
        id: nextUserId(data.users),
        email: em,
        name: String(name || em).trim(),
        role: roleResolved.display,
        plan: planResolved.adminPlan,
        status: USER_STATUSES.PENDING_VERIFICATION,
        lastLogin: 'Never',
        passwordHash: hashPassword(password),
        emailVerified: false,
        verificationToken: token,
        verificationTokenExpires: expires,
        createdAt: new Date().toISOString(),
        profileExtra: {
          ...(profileExtra || {}),
          roleSlug: roleResolved.slug,
          billingPlanId: planResolved.planId,
          subscriptionPlan: planResolved.subscriptionPlan,
          signupPlan: planResolved.planId,
        },
      }
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: em,
        action: 'user_registered',
        target: em,
        details: {
          status: USER_STATUSES.PENDING_VERIFICATION,
          role: roleResolved.display,
          roleSlug: roleResolved.slug,
          plan: planResolved.adminPlan,
          billingPlanId: planResolved.planId,
        },
      })
      writeJsonStore(jsonFilePath, { ...data, users: [...data.users, user], auditLog })
      return { ok: true, user, verificationToken: token, verificationTokenExpires: expires }
    },
    verifyEmailByToken(token) {
      const { data } = readJsonStore(jsonFilePath)
      const t = String(token || '').trim()
      const idx = data.users.findIndex(u => String(u.verificationToken || '') === t)
      if (idx < 0) return { ok: false, error: 'invalid_token' }
      const prev = data.users[idx]
      if (isVerificationExpired(prev.verificationTokenExpires)) {
        return { ok: false, error: 'token_expired' }
      }
      const nextStatus = statusAfterEmailVerify(prev.role)
      const u = {
        ...prev,
        emailVerified: true,
        status: nextStatus,
        verificationToken: null,
        verificationTokenExpires: null,
      }
      const users = [...data.users]
      users[idx] = u
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: u.email,
        action: 'email_verified',
        target: u.email,
        details: { status: nextStatus },
      })
      writeJsonStore(jsonFilePath, { ...data, users, auditLog })
      return { ok: true, user: u, publicUser: toPublicAuthUser(u) }
    },
    setVerificationToken(email, token, expiresAt) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      const idx = data.users.findIndex(u => normalizeEmail(u.email) === em)
      if (idx < 0) return { ok: false, error: 'not_found' }
      const expires = expiresAt || verificationExpiresAt()
      const users = [...data.users]
      users[idx] = {
        ...users[idx],
        verificationToken: token,
        verificationTokenExpires: expires,
        emailVerified: false,
        status: 'Pending Verification',
      }
      writeJsonStore(jsonFilePath, { ...data, users })
      return { ok: true }
    },
    provisionUserByOwner({
      name,
      email,
      password,
      role,
      status,
      emailVerified,
      profileExtra,
      provisionedBy,
    }) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      if (!em || !String(em).includes('@')) return { ok: false, error: 'email_required' }
      if (data.users.some(u => normalizeEmail(u.email) === em)) return { ok: false, error: 'email_exists' }
      const pwd = String(password || '')
      if (pwd.length < 8) return { ok: false, error: 'password_too_short' }
      let user = {
        id: nextUserId(data.users),
        email: em,
        name: String(name || em).trim(),
        role: String(role || 'Viewer').trim() || 'Viewer',
        status: String(status || USER_STATUSES.ACTIVE),
        lastLogin: 'Never',
        passwordHash: hashPassword(pwd),
        emailVerified: emailVerified !== false,
        verificationToken: null,
        verificationTokenExpires: null,
        createdAt: new Date().toISOString(),
        profileExtra: profileExtra && typeof profileExtra === 'object' ? profileExtra : undefined,
      }
      user = applySystemOwnerToDirectoryUser(user)
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: provisionedBy ?? null,
        action: 'owner_provision',
        target: em,
        details: { role: user.role, status: user.status, emailVerified: user.emailVerified },
      })
      writeJsonStore(jsonFilePath, { ...data, users: [...data.users, user], auditLog })
      return { ok: true, user, publicUser: toPublicAuthUser(user) }
    },
    ensureOwnerProvisionedSignIn({ email, password, status, emailVerified, provisionedBy }) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      const pwd = String(password || '')
      if (!em || pwd.length < 8) return { ok: false, error: 'invalid_input' }
      const idx = data.users.findIndex(u => normalizeEmail(u.email) === em)
      if (idx < 0) return { ok: false, error: 'not_found' }
      const prev = data.users[idx]
      const users = [...data.users]
      users[idx] = {
        ...prev,
        passwordHash: hashPassword(pwd),
        emailVerified: emailVerified !== false ? true : prev.emailVerified,
        status: status ? String(status) : prev.status,
      }
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: provisionedBy ?? null,
        action: 'owner_provision_signin_repair',
        target: em,
      })
      writeJsonStore(jsonFilePath, { ...data, users, auditLog })
      const user = users[idx]
      return { ok: true, user, publicUser: toPublicAuthUser(user), repaired: true }
    },
    loginUser(email, password) {
      const { data } = readJsonStore(jsonFilePath)
      const u = data.users.find(x => normalizeEmail(x.email) === normalizeEmail(email))
      if (!u) return { ok: false, error: 'user_not_found' }
      if (!String(u.passwordHash || '').trim()) {
        return {
          ok: false,
          error: 'auth_incomplete',
          message: 'Account exists but is not activated for sign-in. Contact your administrator.',
        }
      }
      if (!checkPassword(u.passwordHash, password)) return { ok: false, error: 'invalid_password' }
      const gate = canLoginUser(u)
      if (!gate.ok) return { ok: false, error: gate.error, message: gate.message }
      const ts = new Date().toISOString()
      const users = data.users.map(row =>
        normalizeEmail(row.email) === normalizeEmail(email) ? { ...row, lastLogin: ts } : row,
      )
      writeJsonStore(jsonFilePath, { ...data, users })
      const fresh = { ...u, lastLogin: ts }
      return { ok: true, user: fresh, publicUser: toPublicAuthUser(fresh) }
    },
    lookupUsernameHint(email) {
      const { data } = readJsonStore(jsonFilePath)
      return usernameHintFromUser(data.users.find(u => normalizeEmail(u.email) === normalizeEmail(email)) || null)
    },
    setPasswordResetToken(email, token, expiresAt) {
      const { data } = readJsonStore(jsonFilePath)
      const em = normalizeEmail(email)
      const idx = data.users.findIndex(u => normalizeEmail(u.email) === em)
      if (idx < 0) return { ok: false, error: 'not_found' }
      const users = [...data.users]
      users[idx] = userWithPasswordReset(
        users[idx],
        token,
        expiresAt || passwordResetExpiresAt(),
      )
      writeJsonStore(jsonFilePath, { ...data, users })
      return { ok: true }
    },
    resetPasswordByToken(token, newPassword) {
      const pwd = String(newPassword || '')
      if (pwd.length < 8) return { ok: false, error: 'password_too_short' }
      const { data } = readJsonStore(jsonFilePath)
      const prev = findUserByPasswordResetToken(data.users, token)
      if (!prev) return { ok: false, error: 'invalid_token' }
      const extra = parseProfileExtra(prev)
      if (isPasswordResetExpired(extra.passwordResetExpires)) {
        return { ok: false, error: 'token_expired' }
      }
      const idx = data.users.findIndex(u => Number(u.id) === Number(prev.id))
      if (idx < 0) return { ok: false, error: 'invalid_token' }
      const users = [...data.users]
      users[idx] = userWithPasswordReset(
        {
          ...users[idx],
          passwordHash: hashPassword(pwd),
          emailVerified: users[idx].emailVerified !== false ? true : users[idx].emailVerified,
        },
        null,
        null,
      )
      const auditLog = appendAuditEntry(data.auditLog, {
        actor: prev.email,
        action: 'password_reset',
        target: prev.email,
      })
      writeJsonStore(jsonFilePath, { ...data, users, auditLog })
      return { ok: true, email: normalizeEmail(prev.email) }
    },
    upsertOAuthUser(payload) {
      const { data } = readJsonStore(jsonFilePath)
      const out = oauthUpsertFromDirectory(
        { users: data.users, auditLog: data.auditLog },
        payload,
        () => nextUserId(data.users),
      )
      if (!out.ok) return out
      writeJsonStore(jsonFilePath, { ...data, users: out.users })
      const gate = canLoginUser(out.user)
      if (!gate.ok) return { ok: false, error: gate.error, message: gate.message }
      return {
        ok: true,
        user: out.user,
        publicUser: toPublicAuthUser(out.user),
        pendingApproval: Boolean(out.pendingApproval),
      }
    },
  }
  return attachRbacToStore(jsonBase, {
    getUsers: () => readJsonStore(jsonFilePath).data.users,
    getAudit: () => readJsonStore(jsonFilePath).data.auditLog || [],
    appendAudit: (log, entry) => appendAuditEntry(log, entry),
    mutateUsers: fn => jsonMutateUsers(fn),
  })
}
