import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  emptyCompositeDraft,
  isLinkedSystemTokenName,
  systemTokenCompositeCard,
  validateCompositeDraft,
  type SystemTokenCompositeCard,
} from '../../lib/admin/systemTokenFormConfig'
import {
  fetchSystemTokensAdmin,
  migrateTokensFromVault,
  patchSystemToken,
  testSystemToken,
  upsertSystemToken,
  type SystemTokenMasked,
} from '../../lib/systemTokensApi'
import { isPlatformOwnerUser, readCurrentUser } from '../../lib/auth'
import './admin-system-tokens.css'

export default function AdminSystemTokensPage() {
  const me = readCurrentUser()
  const isOwner = isPlatformOwnerUser(me)
  const canView = isOwner

  const [tokens, setTokens] = useState<SystemTokenMasked[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [compositeDraft, setCompositeDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchSystemTokensAdmin()
    setLoading(false)
    if (!res.ok) {
      setError(res.error ?? 'Failed to load tokens')
      return
    }
    setTokens(res.tokens ?? [])
  }, [])

  useEffect(() => {
    if (!canView) return
    void refresh()
  }, [canView, refresh])

  if (!canView) {
    return (
      <div className="admin-forbidden">
        <h1>Owner access required</h1>
        <p>API tokens can only be viewed and managed by the platform Owner.</p>
        <Link to="/settings/admin/users" className="admin-btn admin-btn--primary">
          Back to admin
        </Link>
      </div>
    )
  }

  const tokenByName = useMemo(() => new Map(tokens.map(t => [t.name, t])), [tokens])

  const visibleTokens = useMemo(
    () => tokens.filter(t => !isLinkedSystemTokenName(t.name)),
    [tokens],
  )

  const onSave = async (name: string) => {
    if (!isOwner) return
    setBusy(name)
    const res = await upsertSystemToken(name, draftValue.trim())
    setBusy(null)
    if (!res.ok) {
      setError(res.error ?? 'Save failed')
      return
    }
    setEditing(null)
    setDraftValue('')
    setCompositeDraft({})
    await refresh()
  }

  const onSaveComposite = async (card: SystemTokenCompositeCard) => {
    if (!isOwner) return
    const err = validateCompositeDraft(card, compositeDraft)
    if (err) {
      setError(err)
      return
    }
    const primary = tokenByName.get(card.primaryName)
    const needsBoth = !primary?.configured
    const anyFilled = card.fields.some(f => String(compositeDraft[f.key] ?? '').trim())
    if (!anyFilled) {
      setError('Enter at least one value to save.')
      return
    }
    if (needsBoth) {
      const missing = card.fields.filter(f => f.required && !String(compositeDraft[f.key] ?? '').trim())
      if (missing.length) {
        setError(missing.map(f => `${f.label} is required.`).join(' '))
        return
      }
    }

    setBusy(card.primaryName)
    setError(null)
    for (const field of card.fields) {
      const v = String(compositeDraft[field.key] ?? '').trim()
      if (!v) continue
      const res = await upsertSystemToken(field.tokenName, v)
      if (!res.ok) {
        setBusy(null)
        setError(res.error ?? `Failed to save ${field.label}`)
        return
      }
    }
    setBusy(null)
    setEditing(null)
    setCompositeDraft({})
    await refresh()
  }

  const onToggle = async (t: SystemTokenMasked) => {
    if (!isOwner) return
    setBusy(t.name)
    await patchSystemToken(t.name, { active: !t.active })
    setBusy(null)
    await refresh()
  }

  const onTest = async (name: string) => {
    setBusy(`test:${name}`)
    await testSystemToken(name)
    setBusy(null)
    await refresh()
  }

  const onMigrate = async () => {
    if (!isOwner) return
    setBusy('migrate')
    setMigrateMsg(null)
    const res = await migrateTokensFromVault()
    setBusy(null)
    setMigrateMsg(res.ok ? `Migrated ${res.migrated ?? 0} credential(s) from legacy vault.` : res.error ?? 'Migration failed')
    await refresh()
  }

  return (
    <div className="admin-tokens admin-tokens--lux">
      <header className="admin-tokens__head">
        <div>
          <p className="admin-tokens__eyebrow">System Settings</p>
          <h1 className="admin-tokens__title">API Tokens</h1>
          <p className="admin-tokens__sub">
            Central registry — encrypted in the platform database. Values never ship to browsers or{' '}
            <code>localStorage</code>. All users consume integrations via GeoSyntra backend proxies.
          </p>
        </div>
        {isOwner ? (
          <div className="admin-tokens__head-actions">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void onMigrate()} disabled={busy === 'migrate'}>
              Import from legacy vault
            </button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </button>
          </div>
        ) : null}
      </header>

      {migrateMsg ? <p className="admin-tokens__banner admin-tokens__banner--ok">{migrateMsg}</p> : null}
      {error ? <p className="admin-tokens__banner admin-tokens__banner--err">{error}</p> : null}

      {!isOwner ? (
        <p className="admin-tokens__hint">
          Signed in as <strong>{me?.email}</strong> — view-only. Only the platform <strong>Owner</strong> can add or rotate
          tokens.
        </p>
      ) : null}

      <div className="admin-tokens__grid">
        {loading ? (
          <p className="admin-tokens__loading">Loading token registry…</p>
        ) : (
          visibleTokens.map(t => {
            const composite = systemTokenCompositeCard(t.name)
            if (composite) {
              const oauthRow = tokenByName.get('sentinelhub')
              const configured =
                Boolean(oauthRow?.configured) && Boolean(t.configured)
              const isEditing = editing === composite.primaryName
              return (
                <article
                  key={composite.primaryName}
                  className={`admin-tokens__card admin-tokens__card--composite${t.active && (oauthRow?.active ?? true) ? '' : ' admin-tokens__card--off'}`}
                >
                  <div className="admin-tokens__card-top">
                    <div>
                      <h2 className="admin-tokens__card-title">{t.label}</h2>
                      <span className="admin-tokens__card-id">{composite.primaryName}</span>
                    </div>
                    <span className={`admin-tokens__pill admin-tokens__pill--${configured ? 'on' : 'off'}`}>
                      {configured ? 'Configured' : 'Missing'}
                    </span>
                  </div>
                  <dl className="admin-tokens__meta admin-tokens__meta--stacked">
                    <div>
                      <dt>OAuth token</dt>
                      <dd>{oauthRow?.masked || '—'}</dd>
                    </div>
                    <div>
                      <dt>WMS instance ID</dt>
                      <dd>{t.masked || '—'}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{t.source === oauthRow?.source && t.source !== 'none' ? t.source : `${oauthRow?.source ?? '—'} / ${t.source}`}</dd>
                    </div>
                    <div>
                      <dt>Last test</dt>
                      <dd>
                        {t.lastTestedAt
                          ? `${t.lastTestOk ? 'OK' : 'Fail'} · ${t.lastTestMessage ?? ''}`
                          : '—'}
                      </dd>
                    </div>
                  </dl>

                  {isEditing && isOwner ? (
                    <div className="admin-tokens__fields">
                      {composite.fields.map(field => (
                        <label key={field.key} className="admin-tokens__field">
                          <span>
                            {field.label}
                            {field.required ? <span className="admin-tokens__req"> *</span> : null}
                          </span>
                          <input
                            type={field.secret ? 'password' : 'text'}
                            autoComplete="off"
                            value={compositeDraft[field.key] ?? ''}
                            onChange={e =>
                              setCompositeDraft(d => ({ ...d, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            spellCheck={false}
                          />
                          {field.hint ? <span className="admin-tokens__field-hint">{field.hint}</span> : null}
                        </label>
                      ))}
                    </div>
                  ) : null}

                  <div className="admin-tokens__actions">
                    {isOwner ? (
                      <>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          disabled={busy === composite.primaryName}
                          onClick={() => {
                            if (isEditing) {
                              setEditing(null)
                              setCompositeDraft({})
                            } else {
                              setEditing(composite.primaryName)
                              setCompositeDraft(emptyCompositeDraft(composite))
                              setDraftValue('')
                            }
                          }}
                        >
                          {isEditing ? 'Cancel' : configured ? 'Rotate' : 'Configure'}
                        </button>
                        {isEditing ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary"
                            disabled={busy === composite.primaryName}
                            onClick={() => void onSaveComposite(composite)}
                          >
                            Save
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          disabled={busy === `test:${composite.primaryName}`}
                          onClick={() => void onTest(composite.primaryName)}
                        >
                          Test
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          disabled={busy === composite.primaryName}
                          onClick={() => {
                            void (async () => {
                              setBusy(composite.primaryName)
                              await patchSystemToken('sentinelhub', { active: !(oauthRow?.active ?? true) })
                              await patchSystemToken(composite.primaryName, { active: !t.active })
                              setBusy(null)
                              await refresh()
                            })()
                          }}
                        >
                          {t.active && (oauthRow?.active ?? true) ? 'Disable' : 'Enable'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              )
            }

            return (
            <article key={t.name} className={`admin-tokens__card${t.active ? '' : ' admin-tokens__card--off'}`}>
              <div className="admin-tokens__card-top">
                <div>
                  <h2 className="admin-tokens__card-title">{t.label}</h2>
                  <span className="admin-tokens__card-id">{t.name}</span>
                </div>
                <span className={`admin-tokens__pill admin-tokens__pill--${t.configured ? 'on' : 'off'}`}>
                  {t.configured ? 'Configured' : 'Missing'}
                </span>
              </div>
              <dl className="admin-tokens__meta">
                <div>
                  <dt>Source</dt>
                  <dd>{t.source}</dd>
                </div>
                <div>
                  <dt>Masked</dt>
                  <dd>{t.masked || '—'}</dd>
                </div>
                <div>
                  <dt>Last test</dt>
                  <dd>
                    {t.lastTestedAt
                      ? `${t.lastTestOk ? 'OK' : 'Fail'} · ${t.lastTestMessage ?? ''}`
                      : '—'}
                  </dd>
                </div>
              </dl>

              {editing === t.name && isOwner ? (
                <label className="admin-tokens__field">
                  <span>New token value</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={draftValue}
                    onChange={e => setDraftValue(e.target.value)}
                    placeholder="Paste API key (stored encrypted server-side)"
                  />
                </label>
              ) : null}

              <div className="admin-tokens__actions">
                {isOwner ? (
                  <>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busy === t.name}
                      onClick={() => {
                        if (editing === t.name) {
                          setEditing(null)
                          setDraftValue('')
                          setCompositeDraft({})
                        } else {
                          setEditing(t.name)
                          setDraftValue('')
                          setCompositeDraft({})
                        }
                      }}
                    >
                      {editing === t.name ? 'Cancel' : t.configured ? 'Rotate' : 'Add token'}
                    </button>
                    {editing === t.name ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary"
                        disabled={!draftValue.trim() || busy === t.name}
                        onClick={() => void onSave(t.name)}
                      >
                        Save
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busy === `test:${t.name}`}
                      onClick={() => void onTest(t.name)}
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busy === t.name}
                      onClick={() => void onToggle(t)}
                    >
                      {t.active ? 'Disable' : 'Enable'}
                    </button>
                  </>
                ) : null}
              </div>
            </article>
            )
          })
        )}
      </div>

      <footer className="admin-tokens__foot">
        <p>
          Set <code>AGRI_API_VAULT_MASTER_KEY</code> on the API host for AES-256-GCM at rest. Use server env vars as
          fallback only (never <code>VITE_*</code> secrets in production builds).
        </p>
        <Link to="/settings/api-integrations" className="admin-tokens__link">
          Legacy API Manager (catalog)
        </Link>
      </footer>
    </div>
  )
}
