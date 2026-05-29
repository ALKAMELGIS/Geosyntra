import type { ProfileActivityItem, ProfileLoginSession } from '../../lib/account/userProfileStore'

export type ProfileTabId = 'overview' | 'personal' | 'billing' | 'security' | 'activity' | 'settings'

export type ProfileAccountStatus = 'Active' | 'Pending' | 'Suspended'

export type ProfileRoleLabel = 'Admin' | 'Manager' | 'Participant' | 'Analyst' | 'Editor' | 'Viewer'

export type ProfileViewModel = {
  userId: number
  fullName: string
  username: string
  email: string
  coverUrl?: string
  coverPositionY: number
  role: ProfileRoleLabel
  rawRole: string
  status: ProfileAccountStatus
  emailVerified: boolean
  avatarUrl?: string
  phone: string
  country: string
  organization: string
  accountCreatedAt: string
  lastLoginAt: string
  lastUpdatedAt: string
  completenessPercent: number
  completenessMissing: string[]
  sessions: ProfileLoginSession[]
  activity: ProfileActivityItem[]
  twoFactorEnabled: boolean
  notifyEmail: boolean
  notifyProduct: boolean
  notifySecurity: boolean
  language: string
  planLabel: string
  workspaceLabel: string
}
