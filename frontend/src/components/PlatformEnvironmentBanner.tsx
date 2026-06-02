/**
 * Visible when the SPA is built for staging — end users on production should not see this.
 */
export default function PlatformEnvironmentBanner() {
  const env = String(import.meta.env.VITE_GEOSYNTRA_ENV || '').trim().toLowerCase()
  if (env !== 'staging' && env !== 'development') return null

  const label = env === 'staging' ? 'Staging environment' : 'Development build'

  return (
    <div
      className="platform-env-banner"
      role="status"
      aria-live="polite"
    >
      <i className="fa-solid fa-flask" aria-hidden />
      <span>
        {label} — not for production users. Data and APIs use a separate server vault.
      </span>
    </div>
  )
}
