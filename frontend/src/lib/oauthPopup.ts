/** OAuth popup handshake — oauth-return.html posts back to opener. */

export const OAUTH_POPUP_MESSAGE = 'geosyntra-oauth-return' as const

export type OAuthPopupPayload = {
  type: typeof OAUTH_POPUP_MESSAGE
  code?: string
  state?: string
  error?: string
}

export type OAuthPopupResult =
  | { ok: true; code: string; state: string | null }
  | { ok: false; error: string; cancelled?: boolean; blocked?: boolean }

function popupFeatures(): string {
  const w = 520
  const h = 640
  const left = Math.max(0, Math.round((window.screen.width - w) / 2))
  const top = Math.max(0, Math.round((window.screen.height - h) / 2))
  return `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener=no`
}

/** Open IdP authorize URL in a centered popup; resolves when oauth-return posts a message. */
export function openOAuthAuthorizePopup(authorizeUrl: string): Promise<OAuthPopupResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, error: 'Sign-in is only available in the browser.' })
  }

  return new Promise(resolve => {
    let settled = false
    const finish = (result: OAuthPopupResult) => {
      if (settled) return
      settled = true
      window.clearInterval(pollClosed)
      window.removeEventListener('message', onMessage)
      resolve(result)
    }

    const popup = window.open(authorizeUrl, 'geosyntra_oauth', popupFeatures())
    if (!popup) {
      finish({ ok: false, error: 'popup_blocked', blocked: true })
      return
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as Partial<OAuthPopupPayload> | null
      if (!data || data.type !== OAUTH_POPUP_MESSAGE) return
      try {
        popup.close()
      } catch {
        /* ignore */
      }
      if (data.error) {
        finish({ ok: false, error: String(data.error) })
        return
      }
      const code = String(data.code ?? '').trim()
      if (!code) {
        finish({ ok: false, error: 'Sign-in did not return an authorization code.' })
        return
      }
      finish({ ok: true, code, state: data.state ? String(data.state) : null })
    }

    window.addEventListener('message', onMessage)

    const pollClosed = window.setInterval(() => {
      if (!popup.closed) return
      window.setTimeout(() => {
        if (settled) return
        finish({ ok: false, error: 'Sign-in cancelled.', cancelled: true })
      }, 280)
    }, 320)
  })
}
