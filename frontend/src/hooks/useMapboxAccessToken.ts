import { useSyncExternalStore } from 'react'
import {
  getMapboxAccessToken,
  getMapboxSessionSnapshot,
  getPlatformMapboxAccessToken,
  subscribeMapboxAccessToken,
  subscribeMapboxSession,
} from '../lib/mapboxAccessToken'

/** Mapbox GL init token — always defined (Esri/OSM basemaps work without Hostinger MAPBOX). */
export function useMapboxAccessToken(): string {
  return useSyncExternalStore(subscribeMapboxAccessToken, getMapboxAccessToken, getMapboxAccessToken)
}

/** Hostinger / dev pk.* only — empty when tiles use server proxy or public fallbacks. */
export function usePlatformMapboxAccessToken(): string {
  return useSyncExternalStore(
    subscribeMapboxAccessToken,
    getPlatformMapboxAccessToken,
    getPlatformMapboxAccessToken,
  )
}

/** Session hydrate status for production map loading UI. */
export function useMapboxSessionState() {
  return useSyncExternalStore(subscribeMapboxSession, getMapboxSessionSnapshot, getMapboxSessionSnapshot)
}
