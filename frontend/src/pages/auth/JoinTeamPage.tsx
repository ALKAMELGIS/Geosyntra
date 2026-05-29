import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { startSession } from '../../lib/auth'
import { apiAcceptInvite, apiPreviewInvite } from '../../lib/rbacApi'

export default function JoinTeamPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token.')
      setLoading(false)
      return
    }
    void apiPreviewInvite(token).then(res => {
      if (!res.ok || !res.invite) {
        setError(res.error === 'invite_expired' ? 'This invitation has expired.' : 'Invalid invitation link.')
      } else {
        setEmail(res.invite.email)
        setRole(res.invite.role)
      }
      setLoading(false)
    })
  }, [token])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await apiAcceptInvite({ token, name: name.trim() || email, password })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    startSession(
      {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        roleSlug: result.user.roleSlug,
        status: result.user.status,
        permissions: result.user.permissions,
      },
      { persist: true, accessToken: result.accessToken },
    )
    navigate('/settings/admin', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080c] text-zinc-200 flex items-center justify-center p-6">
        <p className="text-sm text-zinc-400">Loading invitation…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07080c] text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight">Join your team</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {role ? (
            <>
              You were invited as <span className="text-zinc-200 font-medium">{role}</span>
              {email ? (
                <>
                  {' '}
                  for <span className="text-zinc-200">{email}</span>
                </>
              ) : null}
              .
            </>
          ) : (
            'Set your password to activate your staff account.'
          )}
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {!error && email ? (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm">
              <span className="text-zinc-400">Full name</span>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500/50"
                value={name}
                onChange={ev => setName(ev.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400">Password</span>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500/50"
                value={password}
                onChange={ev => setPassword(ev.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {submitting ? 'Creating account…' : 'Accept invitation'}
            </button>
          </form>
        ) : null}

        <p className="mt-6 text-center text-xs text-zinc-500">
          <Link to="/login" className="text-sky-400 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
