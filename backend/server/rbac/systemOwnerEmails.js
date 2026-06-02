/** Built-in workspace owners — always Owner + Active (no approval / invite). */
export const DEFAULT_SYSTEM_OWNER_EMAILS = Object.freeze(['admin@Geosyntra.com'])

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

/** Comma-separated list in RBAC_SYSTEM_OWNER_EMAILS plus defaults above. */
export function listSystemOwnerEmails() {
  const fromEnv = String(process.env.RBAC_SYSTEM_OWNER_EMAILS || '')
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean)
  return [...new Set([...DEFAULT_SYSTEM_OWNER_EMAILS.map(normalizeEmail), ...fromEnv])]
}

export function isSystemOwnerEmail(email) {
  const em = normalizeEmail(email)
  if (!em) return false
  return listSystemOwnerEmails().includes(em)
}
