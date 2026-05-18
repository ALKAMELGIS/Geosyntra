import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Monitor,
  Phone,
  Settings,
  Shield,
  User,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { SAAS_ROUTES } from '../../lib/saasRoutes'
import { homeWizardSearch } from '../../lib/homeWizardEntry'
import { applyThemeToDocument, useSystemSettings } from '../../store/SystemSettingsContext'
import type { SystemSettingsPersistedV1 } from '../../types/systemSettings'
import { ProfileHeader } from './components/premium/ProfileHeader'
import { ProfileInfoCard } from './components/ProfileInfoCard'
import { ProfileSkeleton } from './components/ProfileSkeleton'
import { formatProfileDate, formatRelative } from './profileUtils'
import { useProfilePageData } from './useProfilePageData'
import type { ProfileTabId } from './types'

const TABS: { id: ProfileTabId; label: string; icon: typeof User }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { settings, setSettings } = useSystemSettings()
  const {
    user,
    logout,
    viewModel,
    loading,
    saving,
    patchExtended,
    savePersonal,
    uploadAvatar,
    removeAvatar,
    uploadCover,
    removeCover,
    updateCoverPosition,
    revokeOtherSessions,
  } = useProfilePageData()

  const [tab, setTab] = useState<ProfileTabId>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [personalDraft, setPersonalDraft] = useState({ phone: '', country: '', organization: '' })
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState({ current: '', next: '', confirm: '' })
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)

  const syncPersonalDraft = useCallback(() => {
    if (!viewModel) return
    setPersonalDraft({
      phone: viewModel.phone,
      country: viewModel.country,
      organization: viewModel.organization,
    })
  }, [viewModel])

  useEffect(() => {
    syncPersonalDraft()
  }, [syncPersonalDraft])

  if (!user) {
    return (
      <Navigate
        to={{ pathname: SAAS_ROUTES.authLogin, search: homeWizardSearch({ authMode: 'signin' }) }}
        replace
      />
    )
  }

  if (loading || !viewModel) {
    return (
      <ProfileShell>
        <ProfileSkeleton />
      </ProfileShell>
    )
  }

  const onLogout = () => {
    logout()
    navigate({ pathname: SAAS_ROUTES.home, search: homeWizardSearch({ wizard: 'auth', authMode: 'signin' }) })
  }

  const applyTheme = (themeMode: SystemSettingsPersistedV1['themeMode']) => {
    const next = { ...settings, themeMode }
    setSettings(next)
    applyThemeToDocument(next)
  }

  const tabButton = (t: (typeof TABS)[number]) => {
    const Icon = t.icon
    const active = tab === t.id
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => {
          setTab(t.id)
          setMobileNavOpen(false)
        }}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
          active
            ? 'bg-primary/15 text-foreground ring-1 ring-primary/25'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {t.label}
      </button>
    )
  }

  return (
    <ProfileShell>
      {!viewModel.emailVerified ? (
        <div
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div>
            <p className="text-sm font-semibold text-amber-100">Verify your email</p>
            <p className="mt-0.5 text-xs text-amber-200/80">
              Confirm {viewModel.email} to unlock full workspace access.
            </p>
          </div>
          <Link
            to={{ pathname: SAAS_ROUTES.authVerifyEmail, search: `?email=${encodeURIComponent(viewModel.email)}` }}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-400/90 px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-300"
          >
            Verify now
          </Link>
        </div>
      ) : null}

      <ProfileHeader
        model={viewModel}
        saving={saving}
        onEditProfile={() => {
          setTab('personal')
          setEditingPersonal(true)
          syncPersonalDraft()
        }}
        onAvatarPick={file => void uploadAvatar(file)}
        onCoverPick={file => void uploadCover(file)}
        onCoverRemove={removeCover}
        onCoverPositionChange={updateCoverPosition}
        onOpenSettings={() => setTab('settings')}
      />

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:gap-8">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-24">
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobileNavOpen(o => !o)}
                className="flex w-full items-center justify-between rounded-xl border border-border/80 bg-card/50 px-4 py-3 text-sm font-medium text-foreground"
              >
                {TABS.find(t => t.id === tab)?.label}
                <ChevronDown className={cn('h-4 w-4 transition', mobileNavOpen && 'rotate-180')} />
              </button>
              {mobileNavOpen ? (
                <nav className="mt-2 space-y-1 rounded-xl border border-border/80 bg-card/60 p-2 backdrop-blur-md">
                  {TABS.map(tabButton)}
                </nav>
              ) : null}
            </div>
            <nav className="hidden space-y-1 lg:block" aria-label="Profile sections">
              {TABS.map(tabButton)}
            </nav>
            <button
              type="button"
              onClick={onLogout}
              className="mt-4 hidden w-full items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-200 lg:flex"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 transition-opacity duration-300">
          {tab === 'overview' ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your account snapshot — {viewModel.planLabel} · {viewModel.workspaceLabel}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ProfileInfoCard label="Full name" value={viewModel.fullName} icon={<User className="h-4 w-4" />} />
                <ProfileInfoCard label="Email" value={viewModel.email} icon={<Mail className="h-4 w-4" />} />
                <ProfileInfoCard label="Role" value={viewModel.role} icon={<Shield className="h-4 w-4" />} />
                <ProfileInfoCard
                  label="Organization"
                  value={viewModel.organization || '—'}
                  icon={<Building2 className="h-4 w-4" />}
                  onEdit={() => {
                    setTab('personal')
                    setEditingPersonal(true)
                  }}
                />
                <ProfileInfoCard
                  label="Account created"
                  value={formatProfileDate(viewModel.accountCreatedAt)}
                  icon={<Calendar className="h-4 w-4" />}
                />
                <ProfileInfoCard
                  label="Last login"
                  value={formatProfileDate(viewModel.lastLoginAt)}
                  icon={<Monitor className="h-4 w-4" />}
                />
              </div>
            </section>
          ) : null}

          {tab === 'personal' ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Personal information</h2>
                <p className="mt-1 text-sm text-muted-foreground">Only you can view and edit these details.</p>
              </div>
              {editingPersonal ? (
                <form
                  className="space-y-4 rounded-2xl border border-border/80 bg-card/40 p-5"
                  onSubmit={e => {
                    e.preventDefault()
                    void savePersonal(personalDraft)
                    setEditingPersonal(false)
                  }}
                >
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-muted-foreground">Phone</span>
                    <input
                      value={personalDraft.phone}
                      onChange={e => setPersonalDraft(d => ({ ...d, phone: e.target.value }))}
                      className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-muted-foreground">Country</span>
                    <input
                      value={personalDraft.country}
                      onChange={e => setPersonalDraft(d => ({ ...d, country: e.target.value }))}
                      className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-muted-foreground">Organization</span>
                    <input
                      value={personalDraft.organization}
                      onChange={e => setPersonalDraft(d => ({ ...d, organization: e.target.value }))}
                      className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                    />
                  </label>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPersonal(false)
                        syncPersonalDraft()
                      }}
                      className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProfileInfoCard
                    label="Phone"
                    value={viewModel.phone}
                    icon={<Phone className="h-4 w-4" />}
                    onEdit={() => setEditingPersonal(true)}
                  />
                  <ProfileInfoCard
                    label="Country"
                    value={viewModel.country}
                    icon={<MapPin className="h-4 w-4" />}
                    onEdit={() => setEditingPersonal(true)}
                  />
                  <ProfileInfoCard
                    label="Location"
                    value={viewModel.country || 'Not set'}
                    icon={<Globe className="h-4 w-4" />}
                  />
                  <ProfileInfoCard
                    label="Organization"
                    value={viewModel.organization}
                    icon={<Building2 className="h-4 w-4" />}
                    onEdit={() => setEditingPersonal(true)}
                  />
                </div>
              )}
            </section>
          ) : null}

          {tab === 'security' ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Security</h2>
                <p className="mt-1 text-sm text-muted-foreground">Protect your account and active sessions.</p>
              </div>

              <form
                className="rounded-2xl border border-border/80 bg-card/40 p-5"
                onSubmit={e => {
                  e.preventDefault()
                  if (passwordDraft.next !== passwordDraft.confirm) {
                    setPasswordMsg('New passwords do not match.')
                    return
                  }
                  if (passwordDraft.next.length < 8) {
                    setPasswordMsg('Use at least 8 characters.')
                    return
                  }
                  setPasswordMsg('Password change queued (API integration pending).')
                  setPasswordDraft({ current: '', next: '', confirm: '' })
                }}
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <KeyRound className="h-4 w-4" aria-hidden />
                  Change password
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(['current', 'next', 'confirm'] as const).map(key => (
                    <label key={key} className="block text-sm sm:col-span-2 first:sm:col-span-2">
                      <span className="mb-1 block text-muted-foreground">
                        {key === 'current' ? 'Current password' : key === 'next' ? 'New password' : 'Confirm password'}
                      </span>
                      <input
                        type="password"
                        autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                        value={passwordDraft[key]}
                        onChange={e => setPasswordDraft(d => ({ ...d, [key]: e.target.value }))}
                        className="w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  ))}
                </div>
                {passwordMsg ? <p className="mt-2 text-xs text-muted-foreground">{passwordMsg}</p> : null}
                <button
                  type="submit"
                  className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Update password
                </button>
              </form>

              <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-card/40 p-5">
                <div>
                  <p className="text-sm font-semibold text-foreground">Two-factor authentication</p>
                  <p className="mt-1 text-xs text-muted-foreground">Add an extra layer of security at sign-in.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={viewModel.twoFactorEnabled}
                  onClick={() => patchExtended({ twoFactorEnabled: !viewModel.twoFactorEnabled })}
                  className={cn(
                    'relative h-7 w-12 rounded-full transition',
                    viewModel.twoFactorEnabled ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition',
                      viewModel.twoFactorEnabled ? 'left-5' : 'left-0.5',
                    )}
                  />
                </button>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Login sessions</h3>
                  <button
                    type="button"
                    onClick={revokeOtherSessions}
                    className="text-xs font-medium text-rose-300 hover:text-rose-200"
                  >
                    Log out all other devices
                  </button>
                </div>
                <ul className="space-y-2">
                  {viewModel.sessions.map(s => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-1 rounded-xl border border-border/70 bg-card/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {s.device}
                          {s.current ? (
                            <span className="ml-2 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
                              Current
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.browser} · {s.location}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatRelative(s.lastActive)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {tab === 'activity' ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">Recent sign-ins and account events.</p>
              </div>
              <ol className="relative space-y-0 border-l border-border/60 pl-6">
                {viewModel.activity.map((item, i) => (
                  <li key={item.id} className="relative pb-8 last:pb-0">
                    <span
                      className="absolute -left-[1.55rem] top-1 flex h-3 w-3 rounded-full border-2 border-background bg-primary"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {item.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p> : null}
                    <time className="mt-1 block text-[11px] text-muted-foreground/80">
                      {formatProfileDate(item.at)}
                      {i === 0 ? ` · ${formatRelative(item.at)}` : ''}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {tab === 'settings' ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Settings</h2>
                <p className="mt-1 text-sm text-muted-foreground">Preferences for this account only.</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/40 p-5">
                <label className="block text-sm font-medium text-foreground">Language</label>
                <select
                  value={viewModel.language}
                  onChange={e => patchExtended({ language: e.target.value })}
                  className="mt-2 w-full max-w-xs rounded-xl border border-input bg-background/80 px-3 py-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                  <option value="fr">Français</option>
                </select>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/40 p-5">
                <p className="text-sm font-medium text-foreground">Theme</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['dark', 'light', 'system'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => applyTheme(mode)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition',
                        settings.themeMode === mode
                          ? 'border-primary/40 bg-primary/15 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-card/40 p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Bell className="h-4 w-4" aria-hidden />
                  Notifications
                </p>
                {(
                  [
                    ['notifyEmail', 'Email updates'],
                    ['notifyProduct', 'Product announcements'],
                    ['notifySecurity', 'Security alerts'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <input
                      type="checkbox"
                      checked={viewModel[key]}
                      onChange={e => patchExtended({ [key]: e.target.checked })}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 py-3 text-sm font-semibold text-rose-200 lg:hidden"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </ProfileShell>
  )
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07080c] text-zinc-100">
      <div
        className="pointer-events-none absolute -left-40 top-0 h-[28rem] w-[28rem] rounded-full bg-indigo-600/15 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-[90px]"
        aria-hidden
      />
      <div className="relative border-b border-white/[0.08] bg-[#07080c]/90 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to={SAAS_ROUTES.dashboardDefault}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to workspace
          </Link>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Account profile</span>
        </div>
      </div>
      <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
