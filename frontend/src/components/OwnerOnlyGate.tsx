import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isPlatformOwnerUser, readCurrentUser } from '../lib/auth'

/** Blocks route content unless the signed-in user is platform Owner (or system owner email). */
export function OwnerOnlyGate({ children }: { children: ReactNode }) {
  const user = readCurrentUser()
  if (!isPlatformOwnerUser(user)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
