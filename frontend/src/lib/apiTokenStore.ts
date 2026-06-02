import { create } from 'zustand'
import type { UserApiTokenMasked } from './userApiTokensApi'

type ApiTokenStoreState = {
  masked: UserApiTokenMasked[]
  loaded: boolean
  syncing: boolean
  lastSyncAt: string | null
  lastError: string | null
  setMasked: (tokens: UserApiTokenMasked[]) => void
  setSyncing: (syncing: boolean) => void
  setError: (error: string | null) => void
  markSynced: () => void
  reset: () => void
}

export const useApiTokenStore = create<ApiTokenStoreState>(set => ({
  masked: [],
  loaded: false,
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  setMasked: tokens => set({ masked: tokens, loaded: true, lastError: null }),
  setSyncing: syncing => set({ syncing }),
  setError: error => set({ lastError: error, syncing: false }),
  markSynced: () => set({ syncing: false, lastSyncAt: new Date().toISOString(), lastError: null }),
  reset: () =>
    set({
      masked: [],
      loaded: false,
      syncing: false,
      lastSyncAt: null,
      lastError: null,
    }),
}))
