/** GeoSyntra RBAC role hierarchy — shared labels for Sign up & admin UI. */

export type GeosyntraRoleSlug =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'analyst'
  | 'viewer'
  | 'ai_operator'
  | 'trial_user'

export type SignupRoleOption = {
  slug: GeosyntraRoleSlug
  level: number
  label: string
  shortLabel: string
  description: string
  selectableOnSignup: boolean
  requiresApproval: boolean
}

/** Authority order: Owner (0) … Trial User (6). */
export const GEOSYNTRA_ROLE_HIERARCHY: readonly SignupRoleOption[] = [
  {
    slug: 'owner',
    level: 0,
    label: '👑 Owner',
    shortLabel: 'Owner',
    description: 'Full platform authority — assigned by system bootstrap only.',
    selectableOnSignup: false,
    requiresApproval: false,
  },
  {
    slug: 'admin',
    level: 1,
    label: '🧑‍💼 Admin',
    shortLabel: 'Admin',
    description: 'Organization administration — invite or assign by Owner/Admin.',
    selectableOnSignup: false,
    requiresApproval: false,
  },
  {
    slug: 'manager',
    level: 2,
    label: '🧭 Manager',
    shortLabel: 'Manager',
    description: 'Team & AOI oversight — subject to admin approval after sign up.',
    selectableOnSignup: true,
    requiresApproval: true,
  },
  {
    slug: 'analyst',
    level: 3,
    label: '📊 Analyst',
    shortLabel: 'Analyst',
    description: 'Run analyses, time series, and reporting workflows.',
    selectableOnSignup: true,
    requiresApproval: false,
  },
  {
    slug: 'viewer',
    level: 4,
    label: '👁️ Viewer',
    shortLabel: 'Viewer',
    description: 'Read-only maps and published insights.',
    selectableOnSignup: true,
    requiresApproval: true,
  },
  {
    slug: 'ai_operator',
    level: 5,
    label: '🤖 AI Operator',
    shortLabel: 'AI Operator',
    description: 'Automated AI pipelines and assisted analysis.',
    selectableOnSignup: true,
    requiresApproval: true,
  },
  {
    slug: 'trial_user',
    level: 6,
    label: '🧪 Trial User',
    shortLabel: 'Trial User',
    description: 'Limited trial workspace — default for new registrations.',
    selectableOnSignup: true,
    requiresApproval: false,
  },
] as const

export const DEFAULT_SIGNUP_ROLE_SLUG: GeosyntraRoleSlug = 'trial_user'

export const SIGNUP_ROLE_OPTIONS = GEOSYNTRA_ROLE_HIERARCHY.filter(r => r.selectableOnSignup)

export function signupRoleBySlug(slug: string): SignupRoleOption | undefined {
  return GEOSYNTRA_ROLE_HIERARCHY.find(r => r.slug === slug)
}
