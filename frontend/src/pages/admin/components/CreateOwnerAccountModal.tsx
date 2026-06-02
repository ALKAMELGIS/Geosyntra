import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { appConfirm } from '../../../lib/appDialog'
import {
  ADMIN_USER_STATUSES,
  DEFAULT_OWNER_PROVISIONED_LIMITS,
  OWNER_SUBSCRIPTION_OPTIONS,
  type AdminUserPlan,
  type AdminUserStatus,
  type OwnerProvisionedLimits,
} from '../../../lib/admin/adminUserModel'
import type { RbacRoleOption } from '../../../lib/rbac/rbacRoleCatalog'
import {
  loadRoleOptionsFromPermissionsMatrix,
  permissionsForRoleOption,
} from '../../../lib/rbac/rbacMatrixRoles'
import { createOwnerProvisionedAccount } from '../../../lib/admin/ownerAccountProvisioning'
import { readCurrentUser } from '../../../lib/auth'

export type CreateOwnerAccountModalProps = {
  onClose: () => void
  onCreated: (message: string, activationLink?: string) => void
}

function isCreateAccountFormDirty(state: {
  name: string
  email: string
  organization: string
  limits: OwnerProvisionedLimits
}): boolean {
  if (state.name.trim() || state.email.trim() || state.organization.trim()) return true
  const d = DEFAULT_OWNER_PROVISIONED_LIMITS
  if (
    state.limits.storageLimitGb !== d.storageLimitGb ||
    state.limits.aoiLimit !== d.aoiLimit ||
    state.limits.workspaceAccess !== d.workspaceAccess ||
    state.limits.apiAccess.sentinelHub !== d.apiAccess.sentinelHub ||
    state.limits.apiAccess.geoAi !== d.apiAccess.geoAi ||
    state.limits.apiAccess.exports !== d.apiAccess.exports ||
    state.limits.apiAccess.adminApi !== d.apiAccess.adminApi
  ) {
    return true
  }
  return false
}

function randomTempPassword(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const core = Array.from(bytes, b => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 14)
  return `Gs-${core}!`
}

export function CreateOwnerAccountModal({ onClose, onCreated }: CreateOwnerAccountModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => randomTempPassword())
  const [assignableRoles, setAssignableRoles] = useState<RbacRoleOption[]>([])
  const [roleSlug, setRoleSlug] = useState('analyst')

  useEffect(() => {
    let cancelled = false
    void loadRoleOptionsFromPermissionsMatrix().then(rows => {
      if (cancelled || !rows.length) return
      setAssignableRoles(rows)
      setRoleSlug(prev => (rows.some(r => r.slug === prev) ? prev : rows.find(r => r.slug === 'analyst')?.slug ?? rows[0]!.slug))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedRole = useMemo(
    () => assignableRoles.find(r => r.slug === roleSlug),
    [assignableRoles, roleSlug],
  )
  const selectedPermissions = useMemo(
    () => permissionsForRoleOption(selectedRole, roleSlug),
    [selectedRole, roleSlug],
  )
  const [subscriptionLabel, setSubscriptionLabel] = useState(OWNER_SUBSCRIPTION_OPTIONS[0]!.label)
  const [status, setStatus] = useState<AdminUserStatus>('Active')
  const [organization, setOrganization] = useState('')
  const [sendActivation, setSendActivation] = useState(false)
  const [limits, setLimits] = useState<OwnerProvisionedLimits>(DEFAULT_OWNER_PROVISIONED_LIMITS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const plan: AdminUserPlan = useMemo(() => {
    return OWNER_SUBSCRIPTION_OPTIONS.find(o => o.label === subscriptionLabel)?.plan ?? 'Trial'
  }, [subscriptionLabel])

  const formDirty = useMemo(
    () => isCreateAccountFormDirty({ name, email, organization, limits }),
    [name, email, organization, limits],
  )

  const requestClose = useCallback(async () => {
    if (formDirty) {
      const ok = await appConfirm(
        'لديك بيانات غير محفوظة في هذا النموذج. إغلاق النافذة سيحذف ما أدخلته.\n\nYou have unsaved entries. Close anyway?',
        {
          title: 'Discard changes?',
          confirmLabel: 'Close without saving',
          cancelLabel: 'Keep editing',
        },
      )
      if (!ok) return
    }
    onClose()
  }, [formDirty, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return
      e.preventDefault()
      void requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, requestClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await createOwnerProvisionedAccount(
        {
          name,
          email,
          password,
          role: roleSlug,
          permissions: selectedPermissions,
          plan,
          status: sendActivation ? 'Pending Verification' : status,
          organization,
          sendActivationEmail: sendActivation,
          limits,
        },
        readCurrentUser(),
      )
      if (!result.ok) {
        setError(result.message)
        return
      }
      onCreated(result.message, result.activationLink)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalBackdrop onClose={() => void requestClose()}>
      <div
        className="admin-modal"
        role="dialog"
        aria-labelledby="admin-create-account-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="admin-modal__header">
          <div>
            <h2 id="admin-create-account-title">Create new account</h2>
            <p className="admin-modal__subtitle">Owner provisioning — no public sign-up required</p>
          </div>
          <button type="button" className="admin-btn" onClick={() => void requestClose()} aria-label="Close">
            ✕
          </button>
        </header>

        <form className="admin-owner-form" onSubmit={e => void submit(e)}>
          {error ? (
            <p className="admin-hint admin-hint--error" role="alert">
              {error}
            </p>
          ) : null}

          <FormSection title="Account">
            <Field label="Full name">
              <input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Email address">
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Temporary password">
              <PasswordRow password={password} onPassword={setPassword} onRegen={() => setPassword(randomTempPassword())} />
            </Field>
          </FormSection>

          <FormSection title="Access">
            <Field label="User role">
              <select
                value={roleSlug}
                onChange={e => setRoleSlug(e.target.value)}
                aria-describedby="admin-create-account-role-hint"
                disabled={!assignableRoles.length}
              >
                {assignableRoles.length ? (
                  assignableRoles.map(r => (
                    <option key={r.slug} value={r.slug}>
                      {r.label}
                    </option>
                  ))
                ) : (
                  <option value={roleSlug}>Loading roles…</option>
                )}
              </select>
              <span id="admin-create-account-role-hint" className="admin-owner-field__hint">
                Same order as{' '}
                <a href="/settings/admin/roles" className="admin-link">
                  Roles &amp; permissions
                </a>
                — {assignableRoles.length} roles · permissions enforced on the server.
              </span>
              {selectedPermissions.length ? (
                <div className="admin-owner-role-perms" aria-label="Permissions for selected role">
                  <span className="admin-owner-role-perms__k">Effective permissions</span>
                  <ul className="admin-perm-list admin-perm-list--compact">
                    {selectedPermissions.map(p => (
                      <li key={p}>
                        <code>{p}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Field>
            <Field label="Subscription type">
              <select value={subscriptionLabel} onChange={e => setSubscriptionLabel(e.target.value)}>
                {OWNER_SUBSCRIPTION_OPTIONS.map(o => (
                  <option key={o.label} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account status">
              <select
                value={status}
                disabled={sendActivation}
                onChange={e => setStatus(e.target.value as AdminUserStatus)}
              >
                {ADMIN_USER_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <label className="admin-owner-check">
              <input
                type="checkbox"
                checked={sendActivation}
                onChange={e => setSendActivation(e.target.checked)}
              />
              <span>Send activation link (email verify) instead of immediate sign-in</span>
            </label>
          </FormSection>

          <FormSection title="Workspace & limits">
            <Field label="Organization / company">
              <input value={organization} onChange={e => setOrganization(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Workspace access">
              <select
                value={limits.workspaceAccess}
                onChange={e =>
                  setLimits(l => ({
                    ...l,
                    workspaceAccess: e.target.value as OwnerProvisionedLimits['workspaceAccess'],
                  }))
                }
              >
                <option value="full">Full — all workspaces (Owner override)</option>
                <option value="assigned">Assigned workspace</option>
                <option value="none">None — directory only</option>
              </select>
            </Field>
            <div className="admin-owner-form__grid">
              <Field label="Storage limit (GB)">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={limits.storageLimitGb}
                  onChange={e =>
                    setLimits(l => ({ ...l, storageLimitGb: Number(e.target.value) || 1 }))
                  }
                />
              </Field>
              <Field label="AOI limit">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={limits.aoiLimit}
                  onChange={e => setLimits(l => ({ ...l, aoiLimit: Number(e.target.value) || 1 }))}
                />
              </Field>
            </div>
            <fieldset className="admin-owner-fieldset">
              <legend>API access permissions</legend>
              <Check
                label="Sentinel Hub / raster"
                checked={limits.apiAccess.sentinelHub}
                onChange={v =>
                  setLimits(l => ({ ...l, apiAccess: { ...l.apiAccess, sentinelHub: v } }))
                }
              />
              <Check
                label="Geo-AI"
                checked={limits.apiAccess.geoAi}
                onChange={v => setLimits(l => ({ ...l, apiAccess: { ...l.apiAccess, geoAi: v } }))}
              />
              <Check
                label="Exports & reports"
                checked={limits.apiAccess.exports}
                onChange={v => setLimits(l => ({ ...l, apiAccess: { ...l.apiAccess, exports: v } }))}
              />
              <Check
                label="Admin / directory API"
                checked={limits.apiAccess.adminApi}
                onChange={v => setLimits(l => ({ ...l, apiAccess: { ...l.apiAccess, adminApi: v } }))}
              />
            </fieldset>
          </FormSection>

          <div className="admin-owner-form__actions">
            <button type="button" className="admin-btn" onClick={() => void requestClose()} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  )
}

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const pointerDownOnBackdropRef = useRef(false)

  return (
    <div
      ref={backdropRef}
      className="admin-modal-backdrop"
      role="presentation"
      onPointerDown={e => {
        pointerDownOnBackdropRef.current = e.target === backdropRef.current
      }}
      onClick={e => {
        if (e.target !== backdropRef.current || !pointerDownOnBackdropRef.current) return
        onClose()
      }}
    >
      {children}
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motionDiv className="admin-owner-form__section">
      <h3>{title}</h3>
      {children}
    </motionDiv>
  )
}

function motionDiv({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="admin-owner-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="admin-owner-check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function PasswordRow({
  password,
  onPassword,
  onRegen,
}: {
  password: string
  onPassword: (v: string) => void
  onRegen: () => void
}) {
  return (
    <div className="admin-owner-form__password-row">
      <input
        required
        type="text"
        value={password}
        onChange={e => onPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
      />
      <button type="button" className="admin-btn" onClick={onRegen}>
        Regenerate
      </button>
    </div>
  )
}
