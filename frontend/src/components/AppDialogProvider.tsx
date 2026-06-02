import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import GsIcon, { type GsIconName } from './ui/GsIcon'
import {
  registerAppDialogImpl,
  type AppDialogAlertOptions,
  type AppDialogConfirmOptions,
  type AppDialogImpl,
  type AppDialogPromptOptions,
} from '../lib/appDialog'
import './app-dialog.css'

function splitDialogMessage(message: string): { message: string; detail?: string } {
  const parts = message.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) return { message: message.trim() }
  return { message: parts[0]!, detail: parts.slice(1).join('\n\n') }
}

type DialogState =
  | {
      kind: 'confirm'
      title: string
      message: string
      detail?: string
      confirmLabel: string
      cancelLabel: string
      danger: boolean
      complete: (v: boolean) => void
    }
  | {
      kind: 'alert'
      title: string
      message: string
      detail?: string
      okLabel: string
      complete: () => void
    }
  | {
      kind: 'prompt'
      title: string
      message: string
      detail?: string
      defaultValue: string
      confirmLabel: string
      cancelLabel: string
      complete: (v: string | null) => void
    }

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const openRef = useRef(false)
  const promptInputRef = useRef<HTMLInputElement | null>(null)

  const endDialog = useCallback(() => {
    openRef.current = false
    setDialog(null)
  }, [])

  const confirmImpl = useCallback((message: string, options?: AppDialogConfirmOptions) => {
    return new Promise<boolean>(promiseResolve => {
      if (openRef.current) {
        promiseResolve(window.confirm(message))
        return
      }
      openRef.current = true
      const split = splitDialogMessage(message)
      setDialog({
        kind: 'confirm',
        message: split.message,
        detail: options?.detail?.trim() || split.detail,
        title: options?.title?.trim() || 'Confirm',
        confirmLabel: options?.confirmLabel?.trim() || 'OK',
        cancelLabel: options?.cancelLabel?.trim() || 'Cancel',
        danger: options?.danger === true,
        complete: (v: boolean) => {
          promiseResolve(v)
          endDialog()
        },
      })
    })
  }, [endDialog])

  const alertImpl = useCallback((message: string, options?: AppDialogAlertOptions) => {
    return new Promise<void>(promiseResolve => {
      if (openRef.current) {
        window.alert(message)
        promiseResolve()
        return
      }
      openRef.current = true
      setDialog({
        kind: 'alert',
        message,
        title: options?.title?.trim() || 'Notice',
        okLabel: options?.okLabel?.trim() || 'OK',
        complete: () => {
          promiseResolve()
          endDialog()
        },
      })
    })
  }, [endDialog])

  const promptImpl = useCallback(
    (message: string, defaultValue = '', options?: AppDialogPromptOptions) => {
      return new Promise<string | null>(promiseResolve => {
        if (openRef.current) {
          promiseResolve(window.prompt(message, defaultValue))
          return
        }
        openRef.current = true
        const split = splitDialogMessage(message)
        setDialog({
          kind: 'prompt',
          message: split.message,
          detail: split.detail,
          defaultValue: defaultValue ?? '',
          title: options?.title?.trim() || 'Input',
          confirmLabel: options?.confirmLabel?.trim() || 'OK',
          cancelLabel: options?.cancelLabel?.trim() || 'Cancel',
          complete: (v: string | null) => {
            promiseResolve(v)
            endDialog()
          },
        })
      })
    },
    [endDialog],
  )

  useEffect(() => {
    const impl: AppDialogImpl = {
      confirm: confirmImpl,
      alert: alertImpl,
      prompt: promptImpl,
    }
    registerAppDialogImpl(impl)
    return () => registerAppDialogImpl(null)
  }, [confirmImpl, alertImpl, promptImpl])

  useEffect(() => {
    if (!dialog || dialog.kind !== 'prompt') return
    const t = window.setTimeout(() => {
      promptInputRef.current?.focus()
      promptInputRef.current?.select()
    }, 60)
    return () => window.clearTimeout(t)
  }, [dialog])

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (dialog.kind === 'confirm') dialog.complete(false)
      else if (dialog.kind === 'alert') dialog.complete()
      else dialog.complete(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  const onOverlayPointerDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    if (!dialog) return
    if (dialog.kind === 'confirm') dialog.complete(false)
    else if (dialog.kind === 'alert') dialog.complete()
    else dialog.complete(null)
  }

  /* Pick the medallion glyph based on the dialog's intent. Confirm
   * + danger renders the trash icon (the only destructive trigger
   * we surface today); other variants get a softer cue so the
   * dialog still feels intentional without alarming the user. */
  const medallionIcon: GsIconName | null = dialog
    ? dialog.kind === 'confirm'
      ? dialog.danger
        ? 'trash'
        : 'check-circle'
      : dialog.kind === 'alert'
        ? 'shield'
        : 'pencil'
    : null

  /* `data-variant` drives the colour theming in `app-dialog.css`
   * so we don't need three separate JSX trees for danger / info /
   * prompt — keeps the markup small and the styling declarative. */
  const variantAttr = dialog
    ? dialog.kind === 'confirm' && dialog.danger
      ? 'danger'
      : dialog.kind
    : undefined

  return (
    <>
      {children}
      {dialog ? (
        <div
          className="ds-modal-overlay app-dialog-overlay"
          role="presentation"
          onMouseDown={onOverlayPointerDown}
        >
          <div
            className="ds-modal app-dialog-modal"
            data-variant={variantAttr}
            role={dialog.kind === 'confirm' && dialog.danger ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Top accent ribbon — purely decorative, themed via
                the `data-variant` attribute. */}
            <span className="app-dialog-accent" aria-hidden="true" />

            <div className="app-dialog-content">
              <p className="app-dialog-eyebrow" aria-hidden="true">
                GeoSyntra
              </p>
              {medallionIcon ? (
                <div className="app-dialog-medallion" aria-hidden="true">
                  <GsIcon name={medallionIcon} size={22} />
                </div>
              ) : null}

              <h2 id="app-dialog-title" className="app-dialog-title">
                {dialog.title}
              </h2>

              <p id="app-dialog-message" className="app-dialog-message">
                {dialog.message}
              </p>

              {'detail' in dialog && dialog.detail ? (
                <p id="app-dialog-detail" className="app-dialog-detail">
                  {dialog.detail}
                </p>
              ) : null}

              {dialog.kind === 'prompt' ? (
                <input
                  ref={promptInputRef}
                  type="text"
                  className="app-dialog-input"
                  defaultValue={dialog.defaultValue}
                  aria-label={dialog.message}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = (e.currentTarget as HTMLInputElement).value
                      dialog.complete(v)
                    }
                  }}
                />
              ) : null}
            </div>

            <div className="app-dialog-actions">
              {dialog.kind === 'confirm' ? (
                <>
                  <button
                    type="button"
                    className="app-dialog-btn app-dialog-btn--cancel"
                    onClick={() => dialog.complete(false)}
                  >
                    {dialog.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className={
                      dialog.danger
                        ? 'app-dialog-btn app-dialog-btn--danger'
                        : 'app-dialog-btn app-dialog-btn--primary'
                    }
                    onClick={() => dialog.complete(true)}
                  >
                    {dialog.confirmLabel}
                  </button>
                </>
              ) : dialog.kind === 'alert' ? (
                <button
                  type="button"
                  className="app-dialog-btn app-dialog-btn--primary"
                  onClick={() => dialog.complete()}
                >
                  {dialog.okLabel}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="app-dialog-btn app-dialog-btn--cancel"
                    onClick={() => dialog.complete(null)}
                  >
                    {dialog.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className="app-dialog-btn app-dialog-btn--primary"
                    onClick={() => {
                      const el = promptInputRef.current
                      dialog.complete(el ? el.value : null)
                    }}
                  >
                    {dialog.confirmLabel}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
