import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import './Profile.css'
import { normalizeEmail, normalizeRole, readCurrentUser, startSession, type CurrentUser } from '../../lib/auth'
import { useLanguage } from '../../lib/i18n'

type ManagementRecord = {
  id: number
  name: string
  email: string
  role: string
  scope?: string
  status: string
  lastLogin: string
  managedById?: number
  emailVerified?: boolean
}

/** Extended fields stored under `user_profiles_v1` per email (with avatar). */
type ProfileExtra = {
  avatarDataUrl?: string
  /** Wide banner behind hero (LinkedIn-style), data URL JPEG */
  coverDataUrl?: string
  firstName?: string
  lastName?: string
  phone?: string
  dateOfBirth?: string
  country?: string
  city?: string
  postalCode?: string
}

function profileKey(email: string) {
  return String(email || '').trim().toLowerCase()
}

function readProfileExtra(email: string): ProfileExtra {
  try {
    const raw = localStorage.getItem('user_profiles_v1')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>
    const row = parsed[profileKey(email)]
    if (!row || typeof row !== 'object') return {}
    return row as ProfileExtra
  } catch {
    return {}
  }
}

function writeProfileExtra(email: string, patch: Partial<ProfileExtra>) {
  const key = profileKey(email)
  try {
    const raw = localStorage.getItem('user_profiles_v1')
    const all: Record<string, Record<string, unknown>> = raw ? JSON.parse(raw) : {}
    const prev = all[key] && typeof all[key] === 'object' ? all[key]! : {}
    all[key] = { ...prev, ...patch }
    localStorage.setItem('user_profiles_v1', JSON.stringify(all))
    window.dispatchEvent(new Event('storage'))
  } catch {
    /* ignore */
  }
}

/** Downscale cover image for localStorage; keeps banner readable */
async function fileToCoverDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const maxW = 1600
      const maxH = 520
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (!w || !h) {
        resolve(raw)
        return
      }
      const scale = Math.min(maxW / w, maxH / h, 1)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(raw)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    img.onerror = () => resolve(raw)
    img.src = raw
  })
}

function splitDisplayName(full: string): { first: string; last: string } {
  const t = full.trim()
  if (!t) return { first: '', last: '' }
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { first: parts[0]!, last: '' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
}

function shouldPersistSession(): boolean {
  try {
    return !sessionStorage.getItem('currentUser')
  } catch {
    return true
  }
}

function toDateInputValue(raw: string | undefined): string {
  if (!raw?.trim()) return ''
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

function formatDobDisplay(iso: string | undefined, locale: string): string {
  if (!iso || !iso.trim()) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

const profileCopy = {
  en: {
    myProfile: 'My Profile',
    subtitle: 'Manage your profile and view directory details.',
    personalInformation: 'Personal Information',
    address: 'Address',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    changePhoto: 'Change profile photo',
    changeCoverPhoto: 'Change cover photo',
    removeCoverPhoto: 'Remove cover',
    firstName: 'First Name',
    lastName: 'Last Name',
    emailAddress: 'Email Address',
    phoneNumber: 'Phone Number',
    dateOfBirth: 'Date of Birth',
    userRole: 'User Role',
    country: 'Country',
    city: 'City',
    postalCode: 'Postal Code',
    sessionCard: 'Signed-in session',
    sessionHint: 'Active login snapshot.',
    mgmtCard: 'User Management record',
    mgmtHint: 'Admin directory (local).',
    notInDirectory:
      'No directory entry yet. Your admin can add your account under User Management.',
    userId: 'User ID',
    fullName: 'Full name',
    email: 'Email',
    role: 'Role',
    scope: 'Scope / region',
    status: 'Status',
    lastLogin: 'Last login',
    emailVerified: 'Email verified',
    managedBy: 'Managed by',
    yes: 'Yes',
    no: 'No',
    none: '—',
    openUserManagement: 'User Management',
    settingsWorkflow: 'Workflow data sources',
    roleLine: 'Role',
    locationLine: 'Location',
    roles: {
      Admin: 'Admin',
      Manager: 'Manager',
      'Admin Manager': 'Admin Manager',
      Editor: 'Editor',
      Viewer: 'Viewer',
    } as Record<string, string>,
  },
  ar: {
    myProfile: 'ملفي الشخصي',
    subtitle: 'إدارة ملفك وعرض تفاصيل الدليل.',
    personalInformation: 'المعلومات الشخصية',
    address: 'العنوان',
    edit: 'تعديل',
    save: 'حفظ',
    cancel: 'إلغاء',
    changePhoto: 'تغيير صورة الملف',
    changeCoverPhoto: 'تغيير صورة الغلاف',
    removeCoverPhoto: 'إزالة الغلاف',
    firstName: 'الاسم الأول',
    lastName: 'اسم العائلة',
    emailAddress: 'البريد الإلكتروني',
    phoneNumber: 'رقم الهاتف',
    dateOfBirth: 'تاريخ الميلاد',
    userRole: 'دور المستخدم',
    country: 'الدولة',
    city: 'المدينة',
    postalCode: 'الرمز البريدي',
    sessionCard: 'جلسة الدخول',
    sessionHint: 'لقطة من الجلسة النشطة.',
    mgmtCard: 'سجل إدارة المستخدمين',
    mgmtHint: 'دليل المسؤول (محلي).',
    notInDirectory: 'لا يوجد سجل بعد. يمكن للمسؤول إضافة حسابك من إدارة المستخدمين.',
    userId: 'معرف المستخدم',
    fullName: 'الاسم الكامل',
    email: 'البريد',
    role: 'الدور',
    scope: 'النطاق',
    status: 'الحالة',
    lastLogin: 'آخر دخول',
    emailVerified: 'البريد مُفعَّل',
    managedBy: 'يُدار بواسطة',
    yes: 'نعم',
    no: 'لا',
    none: '—',
    openUserManagement: 'إدارة المستخدمين',
    settingsWorkflow: 'مصادر بيانات سير العمل',
    roleLine: 'الدور',
    locationLine: 'الموقع',
    roles: {
      Admin: 'مدير النظام',
      Manager: 'مدير',
      'Admin Manager': 'مدير إداري',
      Editor: 'محرر',
      Viewer: 'مشاهد',
    } as Record<string, string>,
  },
} as const

function parseManagementUsers(): ManagementRecord[] {
  try {
    const raw = localStorage.getItem('adminUsers')
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: ManagementRecord[] = []
    for (const rawRow of parsed) {
      if (!rawRow || typeof rawRow !== 'object') continue
      const r = rawRow as Record<string, unknown>
      const email = String(r.email || '').trim()
      if (!email) continue
      const id = typeof r.id === 'number' ? r.id : Number(r.id || 0)
      out.push({
        id: Number.isFinite(id) && id > 0 ? id : Date.now(),
        name: String(r.name || email),
        email,
        role: normalizeRole(r.role),
        scope: r.scope ? String(r.scope).trim() || undefined : undefined,
        status: String(r.status || 'Active'),
        lastLogin: String(r.lastLogin || 'Never'),
        managedById: typeof r.managedById === 'number' ? r.managedById : undefined,
        emailVerified: typeof r.emailVerified === 'boolean' ? r.emailVerified : undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

function resolveManagerName(users: ManagementRecord[], managedById?: number): string | null {
  if (typeof managedById !== 'number') return null
  const m = users.find(u => u.id === managedById)
  return m ? m.name : null
}

function roleLabel(role: string, lang: 'en' | 'ar'): string {
  const map = profileCopy[lang].roles as Record<string, string>
  return map[role] ?? role
}

export default function Profile() {
  const { language } = useLanguage()
  const text = profileCopy[language]
  const dir = language === 'ar' ? 'rtl' : 'ltr'
  const locale = language === 'ar' ? 'ar-AE' : 'en-GB'

  const [me, setMe] = useState<CurrentUser | null>(() => readCurrentUser())
  const [extra, setExtra] = useState<ProfileExtra>({})
  const [avatarTick, setAvatarTick] = useState(0)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const coverFileRef = useRef<HTMLInputElement | null>(null)

  const [editingPersonal, setEditingPersonal] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [draftP, setDraftP] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    dateOfBirth: '',
  })
  const [draftA, setDraftA] = useState({
    country: '',
    city: '',
    postalCode: '',
  })

  useEffect(() => {
    const refresh = () => setMe(readCurrentUser())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  useEffect(() => {
    if (!me?.email) {
      setExtra({})
      return
    }
    setExtra(readProfileExtra(me.email))
  }, [me?.email, avatarTick])

  const records = parseManagementUsers()
  const mgmt =
    me?.email != null
      ? records.find(u => normalizeEmail(u.email) === normalizeEmail(me.email)) ?? null
      : null

  const currentRole = normalizeRole(me?.role)
  const managerLabel = mgmt?.managedById != null ? resolveManagerName(records, mgmt.managedById) : null

  const split = me ? splitDisplayName(me.name) : { first: '', last: '' }
  const firstName = extra.firstName?.trim() || split.first
  const lastName = extra.lastName?.trim() || split.last
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || me?.name || ''

  const locationLine = [extra.city?.trim(), extra.country?.trim()].filter(Boolean).join(', ') || me?.scope?.trim() || text.none

  const avatarSrc = useMemo(() => {
    if (!me?.email) return `${import.meta.env.BASE_URL}avatars/emirati-farmer.svg`
    const bundle = readProfileExtra(me.email)
    if (bundle.avatarDataUrl?.trim()) return bundle.avatarDataUrl
    return `${import.meta.env.BASE_URL}avatars/emirati-farmer.svg`
  }, [me?.email, avatarTick])

  useEffect(() => {
    document.title = `${text.myProfile} · Agro Cloud`
  }, [text.myProfile])

  const openPersonalEdit = () => {
    if (!me) return
    const ex = readProfileExtra(me.email)
    const sp = splitDisplayName(me.name)
    setDraftP({
      firstName: ex.firstName?.trim() || sp.first,
      lastName: ex.lastName?.trim() || sp.last,
      phone: ex.phone?.trim() || '',
      dateOfBirth: toDateInputValue(ex.dateOfBirth),
    })
    setEditingPersonal(true)
  }

  const savePersonal = () => {
    if (!me?.email) return
    writeProfileExtra(me.email, {
      firstName: draftP.firstName.trim(),
      lastName: draftP.lastName.trim(),
      phone: draftP.phone.trim() || undefined,
      dateOfBirth: draftP.dateOfBirth.trim() || undefined,
    })
    const combined = [draftP.firstName.trim(), draftP.lastName.trim()].filter(Boolean).join(' ').trim()
    if (combined && combined !== me.name.trim()) {
      startSession({ ...me, name: combined }, { persist: shouldPersistSession() })
      setMe(readCurrentUser())
    }
    setExtra(readProfileExtra(me.email))
    setEditingPersonal(false)
  }

  const openAddressEdit = () => {
    if (!me) return
    const ex = readProfileExtra(me.email)
    setDraftA({
      country: ex.country?.trim() || '',
      city: ex.city?.trim() || '',
      postalCode: ex.postalCode?.trim() || '',
    })
    setEditingAddress(true)
  }

  const saveAddress = () => {
    if (!me?.email) return
    writeProfileExtra(me.email, {
      country: draftA.country.trim() || undefined,
      city: draftA.city.trim() || undefined,
      postalCode: draftA.postalCode.trim() || undefined,
    })
    setExtra(readProfileExtra(me.email))
    setEditingAddress(false)
  }

  const onAvatarFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !me?.email) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      if (url.startsWith('data:')) {
        writeProfileExtra(me.email, { avatarDataUrl: url })
        setAvatarTick(x => x + 1)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const onCoverFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !me?.email) return
    if (!file.type.startsWith('image/')) {
      e.target.value = ''
      return
    }
    try {
      const dataUrl = await fileToCoverDataUrl(file)
      writeProfileExtra(me.email, { coverDataUrl: dataUrl })
      setExtra(readProfileExtra(me.email))
    } catch {
      /* ignore */
    }
    e.target.value = ''
  }

  const removeCoverPhoto = () => {
    if (!me?.email) return
    writeProfileExtra(me.email, { coverDataUrl: undefined })
    setExtra(readProfileExtra(me.email))
  }

  const coverSrc = extra.coverDataUrl?.trim() || ''

  return (
    <div className="profile-page-v2" dir={dir}>
      <div className="profile-page-v2-inner">
        <header className="profile-page-header">
          <div className="profile-page-header-top">
            <div className="profile-page-header-lead">
              <h1 className="profile-page-title">{text.myProfile}</h1>
              <p className="profile-page-subtitle">{text.subtitle}</p>
            </div>
          </div>
        </header>

        {!me ? (
          <div className="profile-card">
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
              {language === 'ar' ? 'يرجى تسجيل الدخول لعرض الملف الشخصي.' : 'Please sign in to view your profile.'}
            </p>
          </div>
        ) : (
          <>
            {/* Summary — optional LinkedIn-style cover behind hero */}
            <section
              className={`profile-card profile-card--hero profile-hero-row${coverSrc ? ' profile-card--hero-cover' : ''}`}
              style={
                coverSrc
                  ? {
                      backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.25) 0%, rgba(15, 23, 42, 0.72) 100%), url(${coverSrc})`,
                    }
                  : undefined
              }
            >
              <div className="profile-hero-cover-toolbar">
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onCoverFile}
                  tabIndex={-1}
                  aria-hidden
                />
                <button
                  type="button"
                  className="profile-hero-cover-btn"
                  onClick={() => coverFileRef.current?.click()}
                  aria-label={text.changeCoverPhoto}
                  title={text.changeCoverPhoto}
                >
                  <i className="fa-solid fa-image" aria-hidden />
                  <span className="profile-hero-cover-btn-label">{text.changeCoverPhoto}</span>
                </button>
                {coverSrc ? (
                  <button type="button" className="profile-hero-cover-btn profile-hero-cover-btn--ghost" onClick={removeCoverPhoto} aria-label={text.removeCoverPhoto} title={text.removeCoverPhoto}>
                    <i className="fa-solid fa-xmark" aria-hidden />
                    <span className="profile-hero-cover-btn-label">{text.removeCoverPhoto}</span>
                  </button>
                ) : null}
              </div>
              <div className="profile-hero-cover-body">
              <div className="profile-avatar-wrap">
                <div className="profile-avatar-ring" aria-hidden>
                  <img className="profile-avatar-img" src={avatarSrc} alt="" width={120} height={120} decoding="async" />
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onAvatarFile} aria-hidden />
                <button type="button" className="profile-avatar-camera" onClick={() => fileRef.current?.click()} aria-label={text.changePhoto}>
                  <i className="fa-solid fa-camera" aria-hidden />
                </button>
              </div>
              <div className="profile-hero-text">
                <h2 className="profile-hero-name">{displayName}</h2>
                <p className="profile-hero-meta">
                  <span className="profile-hero-label">{text.roleLine}</span>
                  <span className="profile-hero-value">{roleLabel(normalizeRole(me.role), language)}</span>
                </p>
                <p className="profile-hero-meta">
                  <span className="profile-hero-label">{text.locationLine}</span>
                  <span className="profile-hero-value profile-hero-value--muted">{locationLine}</span>
                </p>
              </div>
              </div>
            </section>

            {/* Personal Information */}
            <section className="profile-card profile-card--panel">
              <div className="profile-card-head">
                <h3 className="profile-card-title">{text.personalInformation}</h3>
                {!editingPersonal ? (
                  <button type="button" className="profile-btn-edit-primary" onClick={openPersonalEdit}>
                    <i className="fa-solid fa-pencil" aria-hidden />
                    {text.edit}
                  </button>
                ) : null}
              </div>

              {!editingPersonal ? (
                <div className="profile-field-grid">
                  <FieldCell label={text.firstName} value={firstName || text.none} />
                  <FieldCell label={text.lastName} value={lastName || text.none} />
                  <FieldCell label={text.dateOfBirth} value={formatDobDisplay(extra.dateOfBirth, locale) || text.none} />
                  <FieldCell label={text.emailAddress} value={me.email} />
                  <FieldCell label={text.phoneNumber} value={extra.phone?.trim() || text.none} />
                  <FieldCell label={text.userRole} value={roleLabel(normalizeRole(me.role), language)} muted />
                </div>
              ) : (
                <>
                  <div className="profile-field-grid">
                    <div>
                      <div className="profile-field-label">{text.firstName}</div>
                      <input
                        className="profile-input"
                        value={draftP.firstName}
                        onChange={e => setDraftP(d => ({ ...d, firstName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.lastName}</div>
                      <input
                        className="profile-input"
                        value={draftP.lastName}
                        onChange={e => setDraftP(d => ({ ...d, lastName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.dateOfBirth}</div>
                      <input
                        className="profile-input"
                        type="date"
                        value={toDateInputValue(draftP.dateOfBirth)}
                        onChange={e => setDraftP(d => ({ ...d, dateOfBirth: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.emailAddress}</div>
                      <input className="profile-input" value={me.email} disabled />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.phoneNumber}</div>
                      <input
                        className="profile-input"
                        value={draftP.phone}
                        onChange={e => setDraftP(d => ({ ...d, phone: e.target.value }))}
                        placeholder="+971 …"
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.userRole}</div>
                      <input className="profile-input" value={roleLabel(normalizeRole(me.role), language)} disabled />
                    </div>
                  </div>
                  <div className="profile-edit-actions">
                    <button type="button" className="profile-btn-save" onClick={savePersonal}>
                      {text.save}
                    </button>
                    <button
                      type="button"
                      className="profile-btn-cancel"
                      onClick={() => {
                        setEditingPersonal(false)
                      }}
                    >
                      {text.cancel}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Address */}
            <section className="profile-card profile-card--panel">
              <div className="profile-card-head">
                <h3 className="profile-card-title">{text.address}</h3>
                {!editingAddress ? (
                  <button type="button" className="profile-btn-edit-secondary" onClick={openAddressEdit}>
                    <i className="fa-solid fa-pencil" aria-hidden />
                    {text.edit}
                  </button>
                ) : null}
              </div>

              {!editingAddress ? (
                <div className="profile-field-grid">
                  <FieldCell label={text.country} value={extra.country?.trim() || text.none} />
                  <FieldCell label={text.city} value={extra.city?.trim() || text.none} />
                  <FieldCell label={text.postalCode} value={extra.postalCode?.trim() || text.none} />
                </div>
              ) : (
                <>
                  <div className="profile-field-grid">
                    <div>
                      <div className="profile-field-label">{text.country}</div>
                      <input
                        className="profile-input"
                        value={draftA.country}
                        onChange={e => setDraftA(d => ({ ...d, country: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.city}</div>
                      <input className="profile-input" value={draftA.city} onChange={e => setDraftA(d => ({ ...d, city: e.target.value }))} />
                    </div>
                    <div>
                      <div className="profile-field-label">{text.postalCode}</div>
                      <input
                        className="profile-input"
                        value={draftA.postalCode}
                        onChange={e => setDraftA(d => ({ ...d, postalCode: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="profile-edit-actions">
                    <button type="button" className="profile-btn-save" onClick={saveAddress}>
                      {text.save}
                    </button>
                    <button type="button" className="profile-btn-cancel" onClick={() => setEditingAddress(false)}>
                      {text.cancel}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* User Management */}
            <div className="profile-mgmt-grid">
              <section className="profile-card profile-card--mgmt">
                <div className="profile-card-head profile-card-head--stack">
                  <div>
                    <h3 className="profile-card-title">{text.sessionCard}</h3>
                    <p className="profile-card-hint">{text.sessionHint}</p>
                  </div>
                </div>
                <ProfileRows
                  rows={[
                    [text.userId, String(me.id)],
                    [text.fullName, me.name],
                    [text.email, me.email],
                    [text.role, roleLabel(normalizeRole(me.role), language)],
                    [text.scope, me.scope?.trim() ? me.scope : text.none],
                  ]}
                  dir={dir}
                />
              </section>

              <section className="profile-card profile-card--mgmt">
                <div className="profile-card-head profile-card-head--stack">
                  <div>
                    <h3 className="profile-card-title">{text.mgmtCard}</h3>
                    <p className="profile-card-hint">{text.mgmtHint}</p>
                  </div>
                </div>
                {!mgmt ? (
                  <p className="profile-empty-hint">{text.notInDirectory}</p>
                ) : (
                  <ProfileRows
                    rows={[
                      [text.userId, String(mgmt.id)],
                      [text.fullName, mgmt.name],
                      [text.email, mgmt.email],
                      [text.role, roleLabel(normalizeRole(mgmt.role), language)],
                      [text.scope, mgmt.scope?.trim() ? mgmt.scope : text.none],
                      [text.status, <StatusPill key="st" status={mgmt.status} />],
                      [text.lastLogin, mgmt.lastLogin],
                      [
                        text.emailVerified,
                        mgmt.emailVerified === true ? text.yes : mgmt.emailVerified === false ? text.no : text.none,
                      ],
                      [text.managedBy, managerLabel ?? text.none],
                    ]}
                    dir={dir}
                  />
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FieldCell({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="profile-field-cell">
      <div className="profile-field-label">{label}</div>
      <div className={muted ? 'profile-field-value profile-field-value-muted' : 'profile-field-value'}>{value}</div>
    </div>
  )
}

function ProfileRows({
  rows,
  dir,
}: {
  rows: [string, ReactNode][]
  dir: 'ltr' | 'rtl'
}) {
  return (
    <dl className="profile-rows-dl" style={{ direction: dir }}>
      {rows.map(([label, value]) => (
        <div key={String(label)}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase()
  let variant: 'neutral' | 'active' | 'danger' | 'info' = 'neutral'
  if (lower === 'active') variant = 'active'
  else if (lower === 'inactive' || lower === 'suspended' || lower === 'deleted') variant = 'danger'
  else if (lower === 'invited') variant = 'info'

  return (
    <span className={`profile-pill profile-pill--${variant}`}>{status}</span>
  )
}
