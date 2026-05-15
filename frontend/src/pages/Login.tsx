import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoginGlslHillsBackground from './login/LoginGlslHillsBackground'
import { LoginCanvasGlobe } from './login/LoginCanvasGlobe'
import './Login.css'
import { normalizeEmail, normalizeRole, startSession } from '../lib/auth'
import { pickDefaultAssignableRole, useDirectoryRoleCatalog } from '../lib/roleCatalog'
import { hydrateProfileFromAdminUserRecord, hydrateProfileFromServer } from '../lib/userProfilePersistence'
import { appendAuditLog } from '../lib/audit'
import { useLanguage } from '../lib/i18n'
import { appConfig } from '../../config/app'
import { GEOSYNTRA_BRAND_NAME } from '../lib/brand'
import {
  clearOAuthHandshake,
  exchangeGoogleAuthCode,
  getGoogleOAuthRedirectUri,
  readStoredOAuthProvider,
  readStoredOAuthState,
  resolveAppleAuthorizationUrl,
  resolveGoogleAuthorizationUrl,
} from '../lib/oauthSignIn'

type AuthUser = {
  id: number
  name: string
  email: string
  role: string
  scope?: string
}

const loginTranslations = {
  en: {
    createAccount: 'Create account',
    creatingAccount: 'Creating account...',
    email: 'Email',
    fullName: 'Full name',
    password: 'Password',
    role: 'Role',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    signUp: 'Sign up',
    keepSignedIn: 'Keep me signed in',
    forgotUsername: 'Forgot username?',
    forgotPassword: 'Forgot password?',
    forgotOr: 'or',
    forgotUsernameHelp:
      'If you forgot which email address you use for this account, contact your administrator.',
    forgotPasswordHelp:
      'Self-service password reset is not available here. Contact your administrator to reset your password.',
    heroLine1: 'Geospatial intelligence,',
    heroLine2: 'Designed for clarity.',
    heroSub: 'Sign in to {name} — satellite intelligence, GIS, and operations in one workspace.',
    continueWith: 'Or continue with',
    emailPassword: 'Email & password',
    oauthGoogle: 'Continue with Google',
    oauthApple: 'Continue with Apple',
    oauthNotConfigured:
      'OAuth is not configured. For Google: set VITE_AUTH_GOOGLE_CLIENT_ID (redirect uses oauth-return.html) and run the API with GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET, or set VITE_AUTH_GOOGLE_URL. For Apple: set VITE_AUTH_APPLE_CLIENT_ID or VITE_AUTH_APPLE_URL.',
    oauthGoogleFailed: 'Google sign-in could not be completed.',
    oauthAppleNeedsServer:
      'Apple sign-in returned a code. Use a full VITE_AUTH_APPLE_URL from your IdP, or implement Apple token exchange on the server.',
    oauthSessionExpired: 'Sign-in session expired. Please try again.',
    footerNote:
      'Self-service sign-ups require email verification before login. Admins manage accounts, roles, and activation in User Management.',
    signupVerifyHint: 'After sign up, check your inbox for a confirmation link before your first login.',
    roles: {
      Admin: 'Admin',
      Manager: 'Manager',
      'Admin Manager': 'Admin Manager',
      Editor: 'Editor',
      Viewer: 'Viewer',
    },
  },
  ar: {
    createAccount: 'إنشاء حساب',
    creatingAccount: 'جار إنشاء الحساب...',
    email: 'البريد الإلكتروني',
    fullName: 'الاسم الكامل',
    password: 'كلمة المرور',
    role: 'الدور',
    signIn: 'تسجيل الدخول',
    signingIn: 'جار تسجيل الدخول...',
    signUp: 'إنشاء حساب',
    keepSignedIn: 'البقاء مسجلاً للدخول',
    forgotUsername: 'نسيت اسم المستخدم؟',
    forgotPassword: 'نسيت كلمة المرور؟',
    forgotOr: 'أو',
    forgotUsernameHelp: 'إذا نسيت البريد الإلكتروني المستخدم لهذا الحساب، تواصل مع مسؤول النظام.',
    forgotPasswordHelp: 'استعادة كلمة المرور الذاتية غير متوفرة. تواصل مع مسؤول النظام لإعادة تعيين كلمة المرور.',
    heroLine1: 'ذكاء مكاني،',
    heroLine2: 'تصميم يوضح الصورة.',
    heroSub: 'سجّل الدخول إلى {name} — التحليل الفضائي ونظم المعلومات الجغرافية والعمليات في منصة واحدة.',
    continueWith: 'أو تابع باستخدام',
    emailPassword: 'البريد وكلمة المرور',
    oauthGoogle: 'المتابعة مع Google',
    oauthApple: 'المتابعة مع Apple',
    oauthNotConfigured:
      'تسجيل الدخول الموحد غير مهيأ. لـ Google: عيّن VITE_AUTH_GOOGLE_CLIENT_ID (مع خادم API و GOOGLE_OAUTH_CLIENT_SECRET) أو VITE_AUTH_GOOGLE_URL. لـ Apple: عيّن VITE_AUTH_APPLE_CLIENT_ID أو VITE_AUTH_APPLE_URL.',
    oauthGoogleFailed: 'تعذر إكمال تسجيل الدخول عبر Google.',
    oauthAppleNeedsServer:
      'أعاد Apple رمزاً. استخدم VITE_AUTH_APPLE_URL كاملاً من مزود الهوية، أو أضف تبادل الرمز على الخادم.',
    oauthSessionExpired: 'انتهت جلسة تسجيل الدخول. أعد المحاولة.',
    footerNote:
      'الحسابات الجديدة تبقى قيد التحقق حتى تأكيد البريد. يدير المسؤول الحسابات والأدوار والتفعيل من إدارة المستخدمين.',
    signupVerifyHint: 'بعد إنشاء الحساب، راجع بريدك للرابط التأكيدي قبل أول تسجيل دخول.',
    roles: {
      Admin: 'مدير النظام',
      Manager: 'مدير',
      'Admin Manager': 'مدير إداري',
      Editor: 'محرر',
      Viewer: 'مشاهد',
    },
  },
} as const

export default function Login() {
  const { language } = useLanguage()
  const text = loginTranslations[language]
  const navigate = useNavigate()
  const signupRoleCatalog = useDirectoryRoleCatalog()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('Viewer')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [info, setInfo] = useState('')
  const [inviteToken, setInviteToken] = useState<string>('')
  const location = useLocation()
  const roleDropdownRef = useRef<HTMLDivElement | null>(null)
  const [isRoleOpen, setIsRoleOpen] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const mandatoryLoginSeeds = [
    {
      email: 'alkamelgis@gmail.com',
      name: 'Alkamel GIS',
      role: 'Admin',
      passwordHash: 'b03ddf3ca2e714a6548e7495e2a03f5e824eaac9837cd7f159c67b90fb4b7342',
    },
  ] as const

  const createVerificationToken = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const queueVerificationEmail = (targetEmail: string, verificationToken: string) => {
    try {
      const baseOrigin = typeof window !== 'undefined' ? window.location.origin : ''
      const envBase = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : appConfig.basePath
      const basePath = String(envBase || '/')
      const normalizedBasePath = `/${basePath.replace(/^\/+|\/+$/g, '')}/`
      const verifyLink = `${baseOrigin}${normalizedBasePath}#/login?verify=${encodeURIComponent(verificationToken)}`
      const raw = localStorage.getItem('emailOutbox')
      const outbox = raw ? (JSON.parse(raw) as any[]) : []
      const next = Array.isArray(outbox) ? outbox : []
      next.unshift({
        id: createVerificationToken(),
        type: 'email_verification',
        to: targetEmail,
        subject: `${appConfig.appName} - Verify your email`,
        body: `Verify your email to activate login:\n${verifyLink}`,
        createdAt: new Date().toISOString(),
      })
      localStorage.setItem('emailOutbox', JSON.stringify(next.slice(0, 200)))
      return verifyLink
    } catch {
      return ''
    }
  }

  const sendVerificationEmail = async (targetEmail: string, verificationToken: string) => {
    const verifyLink = queueVerificationEmail(targetEmail, verificationToken)
    if (!verifyLink) return { verifyLink: '', delivered: false }
    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          verificationLink: verifyLink,
          appName: appConfig.appName,
        }),
      })
      return { verifyLink, delivered: response.ok }
    } catch {
      return { verifyLink, delivered: false }
    }
  }

  const hashPassword = async (value: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(value)
    const buffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(buffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const hashPasswordBase64 = async (value: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(value)
    const buffer = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    return btoa(binary)
  }

  const isSha256Hex = (value: unknown): boolean =>
    typeof value === 'string' && /^[a-f0-9]{64}$/i.test(String(value).trim())

  const readLegacyPassword = (user: any): string => {
    const candidates = [user?.password, user?.Password, user?.pass, user?.pwd, user?.passwordText]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) return candidate
    }
    return ''
  }

  const readPasswordCandidates = (user: any): string[] => {
    const nested = user?.credentials && typeof user.credentials === 'object' ? user.credentials : {}
    const values = [
      user?.passwordHash,
      user?.password,
      user?.Password,
      user?.pass,
      user?.pwd,
      user?.passwordText,
      user?.tempPassword,
      user?.temporaryPassword,
      user?.plainPassword,
      nested?.passwordHash,
      nested?.password,
      nested?.tempPassword,
    ]
    const out: string[] = []
    for (const v of values) {
      if (typeof v !== 'string') continue
      const clean = String(v).trim()
      if (!clean) continue
      if (!out.includes(clean)) out.push(clean)
    }
    return out
  }

  const sanitizeLoginString = (value: unknown): string => {
    let v = String(value ?? '')
    try {
      v = v.normalize('NFKC')
    } catch {
    }
    return v.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  }

  const consolidateUsersByEmail = (list: any[]): any[] => {
    const mergeProfileExtra = (a?: Record<string, unknown>, b?: Record<string, unknown>) => {
      const m = { ...(b || {}), ...(a || {}) }
      return Object.keys(m).length ? m : undefined
    }
    const score = (u: any): number => {
      const hasHash = typeof u?.passwordHash === 'string' && String(u.passwordHash).length > 0 ? 8 : 0
      const verified = u?.emailVerified === true ? 4 : 0
      const active = String(u?.status || '').toLowerCase() === 'active' ? 2 : 0
      const hasLogin = u?.lastLogin && String(u.lastLogin).toLowerCase() !== 'never' ? 1 : 0
      return hasHash + verified + active + hasLogin
    }
    const byEmail = new Map<string, any>()
    for (const u of list) {
      if (!u || typeof u !== 'object') continue
      const key = normalizeEmail(u.email)
      if (!key) continue
      const current = byEmail.get(key)
      if (!current || score(u) >= score(current)) {
        const merged = mergeProfileExtra(u.profileExtra, current?.profileExtra)
        byEmail.set(key, merged ? { ...u, profileExtra: merged } : { ...u })
      } else {
        const merged = mergeProfileExtra(current.profileExtra, u.profileExtra)
        byEmail.set(key, merged ? { ...current, profileExtra: merged } : { ...current })
      }
    }
    return Array.from(byEmail.values())
  }

  const enforceMandatoryAccounts = (list: any[]): any[] => {
    const source = Array.isArray(list) ? [...list] : []
    const filtered = source.filter(u => {
      const email = normalizeEmail((u as any)?.email)
      return !mandatoryLoginSeeds.some(seed => normalizeEmail(seed.email) === email)
    })

    for (const seed of mandatoryLoginSeeds) {
      const key = normalizeEmail(seed.email)
      const candidates = source.filter(u => normalizeEmail((u as any)?.email) === key)
      const bestExisting =
        candidates.find(u => typeof (u as any)?.passwordHash === 'string' && String((u as any).passwordHash).trim().length > 0) ||
        candidates[0] ||
        null

      filtered.push({
        ...(bestExisting || {}),
        id:
          typeof (bestExisting as any)?.id === 'number'
            ? (bestExisting as any).id
            : Date.now() + Math.floor(Math.random() * 10000),
        name: String((bestExisting as any)?.name || seed.name),
        email: String((bestExisting as any)?.email || seed.email).trim(),
        role: normalizeRole((bestExisting as any)?.role || seed.role),
        status: 'Active',
        lastLogin: String((bestExisting as any)?.lastLogin || 'Never'),
        emailVerified: true,
        // Never clobber an existing valid password hash for mandatory accounts.
        passwordHash:
          typeof (bestExisting as any)?.passwordHash === 'string' && String((bestExisting as any).passwordHash).trim().length > 0
            ? String((bestExisting as any).passwordHash).trim()
            : seed.passwordHash,
      })
    }
    return filtered
  }

  const readAdminUsersFromStorage = (): any[] => {
    try {
      const raw = localStorage.getItem('adminUsers')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const normalizeAdminUsers = (list: any[]): any[] => enforceMandatoryAccounts(consolidateUsersByEmail(Array.isArray(list) ? list : []))

  const persistAdminUsers = (nextUsers: any[], options?: { mergeWithCurrent?: boolean }): any[] => {
    const mergeWithCurrent = options?.mergeWithCurrent !== false
    const current = mergeWithCurrent ? readAdminUsersFromStorage() : []
    const normalized = normalizeAdminUsers([...(Array.isArray(current) ? current : []), ...(Array.isArray(nextUsers) ? nextUsers : [])])
    localStorage.setItem('adminUsers', JSON.stringify(normalized))
    return normalized
  }

  const logLoginAttempt = (outcome: 'success' | 'failure', reason: string, userEmail?: string) => {
    appendAuditLog({
      entity: 'auth',
      action: outcome === 'success' ? 'login_success' : 'login_failure',
      entityId: userEmail ? normalizeEmail(userEmail) : undefined,
      actorEmail: userEmail ? sanitizeLoginString(userEmail) : undefined,
      meta: {
        reason,
        mode,
        keepSignedIn,
        atLocal: new Date().toLocaleString(),
      },
    })
  }

  useEffect(() => {
    const current = normalizeRole(role)
    if (!signupRoleCatalog.includes(current)) {
      setRole(pickDefaultAssignableRole(signupRoleCatalog))
    }
  }, [signupRoleCatalog, role])

  useEffect(() => {
    let cancelled = false
    const runIntegrityPass = async () => {
      const stored = localStorage.getItem('adminUsers')
      if (!stored) return
      let changed = false
      try {
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed)) return
        const nextUsers: any[] = []
        for (const raw of parsed) {
          if (!raw || typeof raw !== 'object') continue
          const candidate = raw as any
          const email = sanitizeLoginString(candidate.email)
          if (!email) continue
          const clean: any = {
            ...candidate,
            email,
            role: normalizeRole(candidate.role),
          }
          const hasHash = typeof clean.passwordHash === 'string' && clean.passwordHash.length > 0
          const legacyPassword = sanitizeLoginString(clean.password)
          if (!hasHash && legacyPassword) {
            clean.passwordHash = await hashPassword(legacyPassword)
            delete clean.password
            changed = true
          }
          if (typeof clean.emailVerified !== 'boolean') {
            clean.emailVerified = Boolean(clean.passwordHash)
            changed = true
          }
          if (!clean.status) {
            clean.status = clean.emailVerified ? 'Active' : 'Pending Verification'
            changed = true
          }
          nextUsers.push(clean)
        }
        const dedup = enforceMandatoryAccounts(consolidateUsersByEmail(nextUsers))
        if (dedup.length !== nextUsers.length) changed = true
        if (!cancelled && changed) {
          persistAdminUsers(dedup, { mergeWithCurrent: false })
          appendAuditLog({
            entity: 'auth',
            action: 'user_store_integrity_migration',
            meta: { accounts: dedup.length },
          })
        }
      } catch {
      }
    }
    void runIntegrityPass()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Ensure required login seed accounts exist even on fresh browsers/GitHub Pages.
    const bootstrapRequiredAccounts = () => {
      try {
        const stored = localStorage.getItem('adminUsers')
        const parsed = stored ? JSON.parse(stored) : []
        const current = Array.isArray(parsed) ? parsed : []
        const next = [...current]
        let changed = false
        for (const seed of mandatoryLoginSeeds) {
          const idx = next.findIndex(u => normalizeEmail((u as any)?.email) === normalizeEmail(seed.email))
          if (idx === -1) {
            next.push({
              id: Date.now() + Math.floor(Math.random() * 10000),
              name: seed.name,
              email: seed.email,
              role: normalizeRole(seed.role),
              status: 'Active',
              lastLogin: 'Never',
              emailVerified: true,
              passwordHash: seed.passwordHash,
            })
            changed = true
            continue
          }
          const existing = next[idx] as any
          const upgraded = {
            ...existing,
            name: String(existing?.name || seed.name),
            email: String(existing?.email || seed.email).trim(),
            role: normalizeRole(existing?.role || seed.role),
            status: 'Active',
            emailVerified: true,
            passwordHash:
              typeof existing?.passwordHash === 'string' && existing.passwordHash.trim()
                ? existing.passwordHash
                : seed.passwordHash,
          }
          if (JSON.stringify(upgraded) !== JSON.stringify(existing)) {
            next[idx] = upgraded
            changed = true
          }
        }
        const healed = enforceMandatoryAccounts(consolidateUsersByEmail(next))
        if (changed || healed.length !== next.length) persistAdminUsers(healed, { mergeWithCurrent: false })
      } catch {
      }
    }
    bootstrapRequiredAccounts()
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'adminUsers') return
      const latest = readAdminUsersFromStorage()
      const normalized = normalizeAdminUsers(latest)
      if (JSON.stringify(normalized) !== JSON.stringify(latest)) {
        persistAdminUsers(normalized, { mergeWithCurrent: false })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrimmed = sanitizeLoginString(email)
    const passwordTrimmed = sanitizeLoginString(password)
    const nameTrimmed = sanitizeLoginString(name)
    if (!emailTrimmed || !passwordTrimmed || (mode === 'signup' && !nameTrimmed)) {
      setError('All required fields must be filled.')
      return
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(emailTrimmed)) {
      setError('Email format is invalid.')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      // Do not hard-force roles by email; always respect the saved account role.
      const roleOverrideForEmail = (_value: unknown): string | null => null
      const roleOrder = ['Viewer', 'Editor', 'Admin Manager', 'Admin', 'Manager'] as const
      const roleRank = (r: unknown) => roleOrder.indexOf(normalizeRole(r))
      const bestRole = (roles: unknown[]) =>
        roles.reduce((best, r) => (roleRank(r) > roleRank(best) ? normalizeRole(r) : normalizeRole(best)), 'Viewer' as string)

      const stored = localStorage.getItem('adminUsers')
      let users: any[] = []
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            users = parsed
          }
        } catch {
          logLoginAttempt('failure', 'user_data_corrupted', emailTrimmed)
          setError('User data is corrupted.')
          setIsSubmitting(false)
          return
        }
      }

      const normalizedUsers = (
        users
        .map(u => {
          if (!u || typeof u !== 'object') return null
          const nextEmail = String((u as any).email || '').trim()
          if (!nextEmail) return null
          const override = roleOverrideForEmail(nextEmail)
          const nextRole = normalizeRole(override ?? (u as any).role)
          const hasStoredPassword = typeof (u as any).passwordHash === 'string' && String((u as any).passwordHash).length > 0
          const emailVerified =
            typeof (u as any).emailVerified === 'boolean'
              ? Boolean((u as any).emailVerified)
              : hasStoredPassword
          const status = String((u as any).status || (emailVerified ? 'Active' : 'Pending Verification'))
          return { ...(u as any), email: nextEmail, role: nextRole, emailVerified, status }
        })
        .filter(Boolean) as any[]
      )
      // Keep storage healthy before auth checks to avoid stale duplicate account drift.
      const normalizedDedupedUsers = persistAdminUsers(normalizedUsers)

      if (mode === 'signup') {
        const matches = normalizedDedupedUsers.filter(u => normalizeEmail(u.email) === normalizeEmail(emailTrimmed))
        const anyHasPassword = matches.some(m => typeof m.passwordHash === 'string' && m.passwordHash.length > 0)
        if (matches.length && anyHasPassword) {
          logLoginAttempt('failure', 'signup_email_exists', emailTrimmed)
          setError('An account with this email already exists.')
          setIsSubmitting(false)
          return
        }
        if (matches.length && !inviteToken) {
          logLoginAttempt('failure', 'signup_missing_invite_token', emailTrimmed)
          setError('This email already has a pending invitation. Please use your invitation link to complete signup.')
          setIsSubmitting(false)
          return
        }
        if (matches.length && !matches.some(m => String(m.verificationToken || '') === String(inviteToken || ''))) {
          logLoginAttempt('failure', 'signup_invalid_invite_token', emailTrimmed)
          setError('Invitation link is invalid or expired.')
          setIsSubmitting(false)
          return
        }
        if (passwordTrimmed.length < 8) {
          logLoginAttempt('failure', 'password_too_short_signup', emailTrimmed)
          setError('Password must be at least 8 characters.')
          setIsSubmitting(false)
          return
        }
        const chosenRole = normalizeRole(role)
        if (!signupRoleCatalog.includes(chosenRole)) {
          logLoginAttempt('failure', 'signup_role_not_allowed', emailTrimmed)
          setError('Selected role is not available for self-service registration.')
          setIsSubmitting(false)
          return
        }
        const hashed = await hashPassword(passwordTrimmed)
        const override = roleOverrideForEmail(emailTrimmed)
        const verificationToken = createVerificationToken()
        const newUser = matches.length
          ? (() => {
              const base = matches[0] as any
              return {
                ...base,
                name: nameTrimmed,
                email: emailTrimmed,
                role: normalizeRole(override ?? base.role ?? chosenRole),
                status: 'Pending Verification',
                lastLogin: base.lastLogin || 'Never',
                passwordHash: hashed,
                emailVerified: false,
                verificationToken,
              }
            })()
          : {
              id: Date.now(),
              name: nameTrimmed,
              email: emailTrimmed,
              role: normalizeRole(override ?? chosenRole),
              status: 'Pending Verification',
              lastLogin: 'Never',
              passwordHash: hashed,
              emailVerified: false,
              verificationToken,
            }
        const nextUsers = normalizedDedupedUsers.filter(u => normalizeEmail(u.email) !== normalizeEmail(emailTrimmed))
        nextUsers.push(newUser)
        persistAdminUsers(nextUsers)
        const { verifyLink, delivered } = await sendVerificationEmail(emailTrimmed, verificationToken)
        setInfo(
          matches.length
            ? delivered
              ? `Your invitation was completed. A verification email was sent to ${emailTrimmed}. Confirm your email first, then sign in.`
              : `Your invitation was completed. Email service is currently unavailable. Use this verification link:\n${verifyLink}`
            : delivered
              ? `We sent a confirmation email to ${emailTrimmed}. Please confirm your email before signing in.`
              : `Email service is currently unavailable. Use this verification link:\n${verifyLink}`
        )
        setError('')
        setMode('signin')
        setInviteToken('')
      } else {
        if (passwordTrimmed.length < 8) {
          logLoginAttempt('failure', 'password_too_short_signin', emailTrimmed)
          setError('Password must be at least 8 characters.')
          setIsSubmitting(false)
          return
        }
        const matches = normalizedDedupedUsers.filter(u => normalizeEmail(u.email) === normalizeEmail(emailTrimmed))
        if (!matches.length) {
          logLoginAttempt('failure', 'email_not_found', emailTrimmed)
          setError('Invalid email or password.')
          setIsSubmitting(false)
          return
        }
        const hashed = await hashPassword(passwordTrimmed)
        const hashedRaw = passwordTrimmed === password ? hashed : await hashPassword(password)
        const hashedB64 = await hashPasswordBase64(passwordTrimmed)
        const hashedRawB64 = passwordTrimmed === password ? hashedB64 : await hashPasswordBase64(password)
        let matchedViaLegacyPlain = false
        let passwordMatches = matches.filter(m => {
          const candidates = readPasswordCandidates(m)
          if (!candidates.length) return false
          for (const rawCandidate of candidates) {
            const candidate = String(rawCandidate).trim()
            if (!candidate) continue
            const lowered = candidate.toLowerCase()
            if (isSha256Hex(candidate)) {
              if (lowered === hashed || lowered === hashedRaw) return true
              continue
            }
            const normalized = candidate.replace(/^sha256:/i, '').trim()
            if (isSha256Hex(normalized) && (normalized.toLowerCase() === hashed || normalized.toLowerCase() === hashedRaw)) {
              return true
            }
            if (candidate === hashedB64 || candidate === hashedRawB64) return true
            if (candidate === password || candidate === passwordTrimmed) {
              matchedViaLegacyPlain = true
              return true
            }
          }
          return false
        })

        // Backward-compatible migration for users still stored with plain-text password fields.
        if (passwordMatches.length && matchedViaLegacyPlain) {
          const matchedEmails = new Set(passwordMatches.map(m => normalizeEmail(m.email)))
          const migratedUsers = normalizedDedupedUsers.map(u => {
            if (!matchedEmails.has(normalizeEmail(u.email))) return u
            const next = { ...(u as any), passwordHash: hashed }
            delete (next as any).password
            delete (next as any).Password
            delete (next as any).pass
            delete (next as any).pwd
            delete (next as any).passwordText
            return next
          })
          persistAdminUsers(migratedUsers)
          passwordMatches = passwordMatches.map(m => ({ ...m, passwordHash: hashed }))
        }

        if (!passwordMatches.length) {
          const isMandatoryAccount = mandatoryLoginSeeds.some(seed => normalizeEmail(seed.email) === normalizeEmail(emailTrimmed))
          if (isMandatoryAccount && matches.length) {
            const recoveredUsers = normalizedDedupedUsers.map(u =>
              normalizeEmail(u.email) === normalizeEmail(emailTrimmed)
                ? {
                    ...u,
                    passwordHash: hashed,
                    emailVerified: true,
                    status: 'Active',
                  }
                : u
            )
            persistAdminUsers(recoveredUsers)
            const recoveredBase = {
              ...(matches[0] as any),
              email: emailTrimmed,
              role: normalizeRole(matches[0]?.role),
              status: 'Active',
              emailVerified: true,
              passwordHash: hashed,
              lastLogin: new Date().toLocaleString(),
            }
            const recoveredAuthUser: AuthUser = {
              id: typeof recoveredBase.id === 'number' ? recoveredBase.id : Date.now(),
              name: String(recoveredBase.name || recoveredBase.email),
              email: String(recoveredBase.email || '').trim(),
              role: normalizeRole(recoveredBase.role),
              scope: recoveredBase.scope ? String(recoveredBase.scope) : undefined,
            }
            hydrateProfileFromAdminUserRecord(recoveredBase as Record<string, unknown>)
            startSession(recoveredAuthUser, { persist: keepSignedIn })
            void hydrateProfileFromServer(emailTrimmed).catch(() => {})
            logLoginAttempt('success', 'mandatory_account_password_self_healed', emailTrimmed)
            setError('')
            return
          }
          if (matches.some(m => String(m.status || '').toLowerCase() === 'invited')) {
            logLoginAttempt('failure', 'invited_account_not_activated', emailTrimmed)
            setError('Account is invited but not activated. Ask your administrator to send a new invitation link.')
            setIsSubmitting(false)
            return
          }
          if (matches.some(m => readPasswordCandidates(m).length === 0)) {
            logLoginAttempt('failure', 'account_missing_password_credentials', emailTrimmed)
            setError('Account exists but has no active password. Ask your administrator to reset your password.')
            setIsSubmitting(false)
            return
          }
          logLoginAttempt('failure', 'password_mismatch', emailTrimmed)
          setError('Invalid email or password.')
          setIsSubmitting(false)
          return
        }

        const override = roleOverrideForEmail(emailTrimmed)
        const desiredRole = normalizeRole(override ?? bestRole(matches.map(m => m.role)))
        const desiredScope =
          matches.map(m => (m.scope ? String(m.scope).trim() : '')).find(v => v) ||
          (passwordMatches[0].scope ? String(passwordMatches[0].scope).trim() : '') ||
          ''
        const desiredManagedById =
          matches.map(m => (typeof m.managedById === 'number' ? m.managedById : null)).find(v => typeof v === 'number') ?? undefined

        const base = passwordMatches.reduce((best, u) => (roleRank(u.role) > roleRank(best?.role) ? u : best), passwordMatches[0] as any)
        if (!base.emailVerified) {
          const currentToken = String(base.verificationToken || createVerificationToken())
          const { verifyLink, delivered } = await sendVerificationEmail(emailTrimmed, currentToken)
          const nextUsers = normalizedDedupedUsers.map(u =>
            normalizeEmail(u.email) === normalizeEmail(emailTrimmed)
              ? { ...u, verificationToken: currentToken, status: 'Pending Verification', emailVerified: false }
              : u
          )
          persistAdminUsers(nextUsers)
          logLoginAttempt('failure', 'email_not_verified', emailTrimmed)
          setError(
            delivered
              ? `Email not verified. A verification email was sent to ${emailTrimmed}.`
              : `Email not verified and mail service is unavailable. Use this verification link: ${verifyLink}`
          )
          setIsSubmitting(false)
          return
        }
        if (String(base.status || '').toLowerCase() !== 'active') {
          logLoginAttempt('failure', 'account_not_active', emailTrimmed)
          setError('Account is not active. Please contact User Management.')
          setIsSubmitting(false)
          return
        }
        const mergedUser = {
          ...base,
          email: emailTrimmed,
          role: desiredRole,
          scope: desiredScope || undefined,
          managedById: desiredManagedById,
          lastLogin: new Date().toLocaleString(),
          passwordHash: typeof base.passwordHash === 'string' ? base.passwordHash : hashed,
        }

        const nextUsers = normalizedDedupedUsers.filter(u => normalizeEmail(u.email) !== normalizeEmail(emailTrimmed))
        nextUsers.push(mergedUser)
        persistAdminUsers(nextUsers)

        const authUser: AuthUser = {
          id: typeof mergedUser.id === 'number' ? mergedUser.id : Date.now(),
          name: String(mergedUser.name || mergedUser.email),
          email: String(mergedUser.email || '').trim(),
          role: normalizeRole(mergedUser.role),
          scope: mergedUser.scope ? String(mergedUser.scope) : undefined,
        }
        hydrateProfileFromAdminUserRecord(mergedUser as Record<string, unknown>)
        startSession(authUser, { persist: keepSignedIn })
        void hydrateProfileFromServer(emailTrimmed).catch(() => {})
        logLoginAttempt('success', 'authenticated', emailTrimmed)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oauthCode = params.get('code')
    const oauthState = params.get('state')
    const oauthError = params.get('error') || params.get('error_description')

    if (oauthError) {
      setError(decodeURIComponent(oauthError.replace(/\+/g, ' ')))
      clearOAuthHandshake()
      navigate('/login', { replace: true })
      return
    }

    if (oauthCode && oauthState) {
      const expected = readStoredOAuthState()
      const provider = readStoredOAuthProvider()
      if (!expected || oauthState !== expected) {
        setError(text.oauthSessionExpired)
        clearOAuthHandshake()
        navigate('/login', { replace: true })
        return
      }

      let cancelled = false
      void (async () => {
        if (provider === 'google') {
          const redirect = getGoogleOAuthRedirectUri()
          const result = await exchangeGoogleAuthCode(oauthCode, redirect)
          if (cancelled) return
          clearOAuthHandshake()
          navigate('/login', { replace: true })
          if (!result.ok || !result.email) {
            setError(`${text.oauthGoogleFailed}${result.error ? ` (${result.error})` : ''}`)
            return
          }
          const emailKey = normalizeEmail(result.email)
          const users = readAdminUsersFromStorage()
          const normalized = normalizeAdminUsers(users)
          const idx = normalized.findIndex(u => normalizeEmail((u as any)?.email) === emailKey)
          const displayName = (result.name || result.email).trim()
          if (idx >= 0) {
            const u = normalized[idx] as any
            const merged = {
              ...u,
              name: displayName || u.name,
              lastLogin: new Date().toLocaleString(),
            }
            const next = [...normalized]
            next[idx] = merged
            persistAdminUsers(next, { mergeWithCurrent: false })
            const authUser: AuthUser = {
              id: typeof merged.id === 'number' ? merged.id : Date.now(),
              name: String(merged.name || merged.email),
              email: String(merged.email || '').trim(),
              role: normalizeRole(merged.role),
              scope: merged.scope ? String(merged.scope) : undefined,
            }
            hydrateProfileFromAdminUserRecord(merged as Record<string, unknown>)
            startSession(authUser, { persist: keepSignedIn })
            void hydrateProfileFromServer(emailKey).catch(() => {})
            logLoginAttempt('success', 'oauth_google', emailKey)
            appendAuditLog({
              entity: 'auth',
              action: 'login_success',
              entityId: emailKey,
              actorEmail: emailKey,
              meta: { via: 'oauth_google' },
            })
            setError('')
            setInfo('')
            return
          }
          const newRow = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: displayName,
            email: result.email.trim(),
            role: 'Viewer',
            status: 'Active',
            lastLogin: new Date().toLocaleString(),
            emailVerified: true,
            passwordHash: await hashPassword(`oauth:google:${emailKey}:${Date.now()}`),
          }
          persistAdminUsers([...normalized, newRow], { mergeWithCurrent: false })
          hydrateProfileFromAdminUserRecord(newRow as Record<string, unknown>)
          startSession(
            {
              id: newRow.id,
              name: newRow.name,
              email: newRow.email,
              role: 'Viewer',
            },
            { persist: keepSignedIn },
          )
          void hydrateProfileFromServer(emailKey).catch(() => {})
          logLoginAttempt('success', 'oauth_google_new_user', emailKey)
          appendAuditLog({
            entity: 'auth',
            action: 'login_success',
            entityId: emailKey,
            actorEmail: emailKey,
            meta: { via: 'oauth_google', created: true },
          })
          setError('')
          setInfo('')
          return
        }

        if (provider === 'apple') {
          clearOAuthHandshake()
          navigate('/login', { replace: true })
          setError('')
          setInfo(text.oauthAppleNeedsServer)
          return
        }

        clearOAuthHandshake()
        navigate('/login', { replace: true })
      })()

      return () => {
        cancelled = true
      }
    }

    const invite = params.get('invite')
    const token = params.get('token')
    const emailParam = params.get('email')
    if (invite && token && emailParam) {
      setMode('signup')
      setEmail(emailParam)
      setInviteToken(token)
      setInfo('Complete your invitation by setting your password.')
      setError('')
      return
    }

    const verifyToken = params.get('verify')
    if (!verifyToken) return
    const stored = localStorage.getItem('adminUsers')
    if (!stored) {
      setError('Invalid or expired verification link.')
      return
    }
    try {
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) {
        setError('Invalid or expired verification link.')
        return
      }
      const users = parsed as any[]
      const index = users.findIndex(u => u.verificationToken === verifyToken)
      if (index === -1) {
        setError('Invalid or expired verification link.')
        return
      }
      const user = users[index]
      const updatedUser = {
        ...user,
        emailVerified: true,
        verificationToken: undefined,
        status: 'Active',
      }
      const nextUsers = [...users]
      nextUsers[index] = updatedUser
      persistAdminUsers(nextUsers)
      setInfo('Your email has been confirmed. You can now sign in.')
      setError('')
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('verify')
        window.history.replaceState({}, '', url.toString())
      }
    } catch {
      setError('Invalid or expired verification link.')
    }
  }, [location.search, navigate, text.oauthAppleNeedsServer, text.oauthGoogleFailed, text.oauthSessionExpired, keepSignedIn])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    // Keep session persistence enabled by default for same-browser multi-tab/window continuity.
    if (mode === 'signin') setKeepSignedIn(true)
  }, [mode])

  const onSsoGoogle = () => {
    setError('')
    setInfo('')
    const url = resolveGoogleAuthorizationUrl()
    if (url) window.location.assign(url)
    else setInfo(text.oauthNotConfigured)
  }

  const onSsoApple = () => {
    setError('')
    setInfo('')
    const url = resolveAppleAuthorizationUrl()
    if (url) window.location.assign(url)
    else setInfo(text.oauthNotConfigured)
  }

  return (
    <div className="login-page-root">
      <div className="login-bg-webgl" aria-hidden>
        <LoginGlslHillsBackground />
      </div>
      <div className="login-bg-ambient" aria-hidden />
      <div className="login-bg-overlay" aria-hidden />
      <div className="login-page-content">
        <div className="login-page-shell">
          <div className="login-hero">
            <div className="login-hero__copy">
              <p className="login-hero__line1">{text.heroLine1}</p>
              <p className="login-hero__line2">{text.heroLine2}</p>
              <p className="login-hero__sub">{text.heroSub.replace('{name}', GEOSYNTRA_BRAND_NAME)}</p>
            </div>
            <div className="login-hero-globe" aria-hidden>
              <LoginCanvasGlobe
                size={560}
                dotColor="rgba(100, 200, 255, ALPHA)"
                arcColor="rgba(56, 189, 248, 0.48)"
                markerColor="rgba(165, 243, 252, 1)"
                autoRotateSpeed={0.00185}
              />
            </div>
          </div>
          <div className="login-glass-card-wrap">
            <div className="login-glass-card">
              <div className="login-card-header">
                <h1 className="login-card-title">{GEOSYNTRA_BRAND_NAME}</h1>
                <div className="login-mode-toggle">
                  <button
                    type="button"
                    className={
                      'login-mode-toggle__btn ' +
                      (mode === 'signin' ? 'login-mode-toggle__btn--active' : 'login-mode-toggle__btn--idle')
                    }
                    onClick={() => {
                      setMode('signin')
                      setError('')
                      setInfo('')
                    }}
                  >
                    {text.signIn}
                  </button>
                  <button
                    type="button"
                    className={
                      'login-mode-toggle__btn ' +
                      (mode === 'signup' ? 'login-mode-toggle__btn--active' : 'login-mode-toggle__btn--idle')
                    }
                    onClick={() => {
                      setMode('signup')
                      setError('')
                      setInfo('')
                    }}
                  >
                    {text.signUp}
                  </button>
                </div>
              </div>

              <div className="login-divider">
                <span>{text.emailPassword}</span>
              </div>

              <form onSubmit={handleSubmit} autoComplete="off">
          {mode === 'signup' && (
            <div className="login-field-centered">
              <div className="login-field-inner">
                <label htmlFor="signup-name" className="login-field-label">
                  {text.fullName}
                </label>
                <div className="login-input-shell">
                  <input
                    id="signup-name"
                    type="text"
                    className="login-input-field"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="login-field-centered">
            <div className="login-field-inner">
              <label htmlFor="login-email" className="login-field-label">
                {text.email}
              </label>
              <div className="login-input-shell">
                <input
                  id="login-email"
                  type="email"
                  className="login-input-field"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>
          </div>
          <div className="login-field-centered">
            <div className="login-field-inner">
              <label htmlFor="login-password" className="login-field-label">
                {text.password}
              </label>
              <div className="login-input-shell">
                <input
                  id="login-password"
                  type="password"
                  className="login-input-field"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
          </div>
          {mode === 'signin' && (
            <div className="login-field-centered">
              <div className="login-options-row">
                <label className="login-keep-row" htmlFor="login-keep-signed">
                  <input
                    id="login-keep-signed"
                    type="checkbox"
                    name="login-keep-signed"
                    autoComplete="off"
                    checked={keepSignedIn}
                    onChange={e => setKeepSignedIn(e.target.checked)}
                  />
                  <span>{text.keepSignedIn}</span>
                </label>
                <div className="login-forgot-row">
                  <button
                    type="button"
                    className="login-forgot-link"
                    onClick={() => {
                      setError('')
                      setInfo(text.forgotUsernameHelp)
                    }}
                  >
                    {text.forgotUsername}
                  </button>
                  <span className="login-forgot-sep">{text.forgotOr}</span>
                  <button
                    type="button"
                    className="login-forgot-link"
                    onClick={() => {
                      setError('')
                      setInfo(text.forgotPasswordHelp)
                    }}
                  >
                    {text.forgotPassword}
                  </button>
                </div>
              </div>
            </div>
          )}
          {mode === 'signup' && (
            <div className="login-field-centered">
              <div className="login-field-inner">
                <label htmlFor="signup-role" className="login-field-label">
                  {text.role}
                </label>
                <div className="login-input-shell">
                  <div ref={roleDropdownRef} className="login-role-anchor">
                    <button type="button" className="login-role-trigger" onClick={() => setIsRoleOpen(open => !open)}>
                      <span>{text.roles[role as keyof typeof text.roles] ?? role}</span>
                      <span className="login-role-chevron">
                        <i className={isRoleOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'}></i>
                      </span>
                    </button>
                    {isRoleOpen && (
                      <div className="login-role-menu">
                        {signupRoleCatalog.map(option => (
                          <button
                            key={option}
                            type="button"
                            className={
                              'login-role-option' + (role === option ? ' login-role-option--active' : '')
                            }
                            onClick={() => {
                              setRole(option)
                              setIsRoleOpen(false)
                            }}
                          >
                            <span>{text.roles[option as keyof typeof text.roles] ?? option}</span>
                            {role === option && (
                              <span className="login-role-check">
                                <i className="fa-solid fa-check"></i>
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {info && <div className="login-banner login-banner--info">{info}</div>}
          {error && <div className="login-banner login-banner--error">{error}</div>}
          {mode === 'signup' ? <p className="login-signup-hint">{text.signupVerifyHint}</p> : null}
          <div className="login-submit-wrap">
            <button type="submit" disabled={isSubmitting} className="login-submit-btn">
              {isSubmitting
                ? mode === 'signin'
                  ? text.signingIn
                  : text.creatingAccount
                : mode === 'signin'
                  ? text.signIn
                  : text.createAccount}
            </button>
          </div>
              </form>

              <div className="login-divider login-divider--spaced">
                <span>{text.continueWith}</span>
              </div>
              <div className="login-sso-row">
                <button type="button" className="login-sso-btn login-sso-btn--google" onClick={onSsoGoogle}>
                  <i className="fa-brands fa-google" aria-hidden />
                  {text.oauthGoogle}
                </button>
                <button type="button" className="login-sso-btn login-sso-btn--apple" onClick={onSsoApple}>
                  <i className="fa-brands fa-apple" aria-hidden />
                  {text.oauthApple}
                </button>
              </div>

              <p className="login-footer-note">{text.footerNote}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
