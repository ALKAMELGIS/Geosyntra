/**
 * WebSocket listener for platform token revision bumps (Owner rotated keys).
 */
import { syncUserApiTokensForSession } from './userTokenSessionSync'

const WS_URL =
  import.meta.env.VITE_PLATFORM_TOKEN_WS_URL?.trim() || 'ws://localhost:3002'

let socket: WebSocket | null = null
let started = false

export function startPlatformTokenRealtimeSync(): void {
  if (typeof window === 'undefined' || started) return
  started = true

  const connect = () => {
    try {
      socket = new WebSocket(WS_URL)
    } catch {
      return
    }

    socket.onmessage = ev => {
      try {
        const msg = JSON.parse(String(ev.data)) as { topic?: string; revision?: number }
        if (msg.topic === 'platform/tokens' && typeof msg.revision === 'number') {
          void syncUserApiTokensForSession({ force: true, revision: msg.revision })
        }
      } catch {
        /* ignore */
      }
    }

    socket.onclose = () => {
      socket = null
      window.setTimeout(connect, 5000)
    }
  }

  connect()
}

export function stopPlatformTokenRealtimeSync(): void {
  if (socket) {
    socket.close()
    socket = null
  }
  started = false
}
