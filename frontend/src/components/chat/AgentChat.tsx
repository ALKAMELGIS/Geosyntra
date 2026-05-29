'use client'

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

export type ChatStatus = 'idle' | 'streaming' | 'submitting' | 'error'

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: AttachedImage }

export type AgentMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]
  /** When set, MessageList may show an error row for this message */
  errorText?: string
}

export type AttachedImage = {
  id: string
  /** Data URL or blob URL for preview */
  previewUrl?: string
  name?: string
  mimeType?: string
}

export type AttachedFile = {
  id: string
  name: string
  size?: number
  mimeType?: string
}

export type AgentChatProps = {
  theme?: 'default' | 'geo'
  messages: AgentMessage[]
  status: ChatStatus
  draft: string
  onDraftChange: (next: string) => void
  onSend: () => void
  onStop?: () => void
  attachedImages?: AttachedImage[]
  attachedFiles?: AttachedFile[]
  onRemoveImage?: (id: string) => void
  onRemoveFile?: (id: string) => void
  /** Opens file picker or custom attach flow; pair with a hidden file input in the parent */
  onAttachClick?: () => void
  /** Global chat error shown above input */
  error?: string | null
  placeholder?: string
  listHeader?: ReactNode
  listFooter?: ReactNode
  renderMessage?: (message: AgentMessage) => ReactNode
  hideInput?: boolean
  inputSlot?: ReactNode
  className?: string
  listClassName?: string
  disabled?: boolean
  maxTextareaRows?: number
  /** Assistant copy control: force on/off; when omitted, geo theme enables copy */
  assistantCopyEnabled?: boolean
}

/* --- Icons --- */

export function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-5 w-5', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

export function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-5 w-5', className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

export function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-5 w-5', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

export function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function GeoGlobeAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        'border border-violet-300/40 bg-violet-500/15 shadow-inner shadow-violet-900/20',
        className,
      )}
      aria-hidden
    >
      <svg className="h-4 w-4 text-violet-200/90" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.25" opacity="0.85" />
        <path
          d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.55"
        />
        <path
          d="M4.5 8.5c2.5 1 5.5 1.35 8 1.35s5.5-.35 8-1.35M4.5 15.5c2.5-1 5.5-1.35 8-1.35s5.5.35 8 1.35"
          stroke="currentColor"
          strokeWidth="0.85"
          opacity="0.45"
        />
      </svg>
    </div>
  )
}

/* --- Bubbles & content --- */

export function UserBubble({
  children,
  className,
  theme = 'default',
}: {
  children: ReactNode
  className?: string
  theme?: 'default' | 'geo'
}) {
  return (
    <div
      className={cn(
        'max-w-[min(100%,42rem)] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed',
        theme === 'geo'
          ? 'border border-white/10 bg-violet-600/20 text-violet-50 shadow-lg shadow-violet-950/30 backdrop-blur-xl'
          : 'bg-zinc-800 text-zinc-50',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function AssistantText({
  children,
  className,
  theme = 'default',
  copyText,
  showCopy,
}: {
  children: ReactNode
  className?: string
  theme?: 'default' | 'geo'
  copyText?: string
  /** When true, shows copy; when undefined, geo theme defaults to on if copyText is set */
  showCopy?: boolean
}) {
  const copyEnabled =
    showCopy !== undefined ? showCopy : theme === 'geo' && Boolean(copyText?.trim())

  const onCopy = useCallback(async () => {
    if (!copyText?.trim()) return
    try {
      await navigator.clipboard.writeText(copyText)
    } catch {
      /* ignore */
    }
  }, [copyText])

  return (
    <div
      className={cn(
        'group relative max-w-[min(100%,42rem)] rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] leading-relaxed',
        theme === 'geo'
          ? 'border border-violet-400/25 bg-violet-500/[0.12] text-violet-50/95 shadow-lg shadow-violet-950/25 backdrop-blur-2xl'
          : 'border border-zinc-700/80 bg-zinc-900/80 text-zinc-100',
        className,
      )}
    >
      <div className="pr-0">{children}</div>
      {copyEnabled ? (
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            'absolute right-2 top-2 rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100',
            theme === 'geo'
              ? 'bg-violet-500/25 text-violet-100 hover:bg-violet-500/35'
              : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600',
          )}
          aria-label="Copy message"
        >
          Copy
        </button>
      ) : null}
    </div>
  )
}

export function ErrorBubble({
  children,
  className,
  theme = 'default',
}: {
  children: ReactNode
  className?: string
  theme?: 'default' | 'geo'
}) {
  return (
    <div
      role="alert"
      className={cn(
        'max-w-[min(100%,42rem)] rounded-2xl border px-4 py-2.5 text-sm',
        theme === 'geo'
          ? 'border-red-400/35 bg-red-950/40 text-red-100 backdrop-blur-xl'
          : 'border-red-500/40 bg-red-950/50 text-red-100',
        className,
      )}
    >
      {children}
    </div>
  )
}

function formatFileSize(n?: number) {
  if (n == null || Number.isNaN(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ImageChip({
  image,
  onRemove,
  theme = 'default',
}: {
  image: AttachedImage
  onRemove?: () => void
  theme?: 'default' | 'geo'
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border px-1.5 py-1 pr-2 text-xs',
        theme === 'geo'
          ? 'border-violet-400/30 bg-violet-500/10 text-violet-100 backdrop-blur-md'
          : 'border-zinc-600 bg-zinc-800 text-zinc-200',
      )}
    >
      {image.previewUrl ? (
        <img
          src={image.previewUrl}
          alt=""
          className="h-9 w-9 rounded-lg object-cover"
        />
      ) : (
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg text-[10px]',
            theme === 'geo' ? 'bg-violet-600/30' : 'bg-zinc-700',
          )}
        >
          IMG
        </div>
      )}
      <span className="max-w-[8rem] truncate">{image.name ?? 'Image'}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            'ml-1 rounded-md p-1 transition-colors',
            theme === 'geo' ? 'hover:bg-violet-500/25' : 'hover:bg-zinc-600',
          )}
          aria-label="Remove image"
        >
          <XIcon />
        </button>
      ) : null}
    </div>
  )
}

export function FileChip({
  file,
  onRemove,
  theme = 'default',
}: {
  file: AttachedFile
  onRemove?: () => void
  theme?: 'default' | 'geo'
}) {
  const sizeLabel = formatFileSize(file.size)
  return (
    <div
      className={cn(
        'flex max-w-[14rem] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs',
        theme === 'geo'
          ? 'border-violet-400/30 bg-violet-500/10 text-violet-100 backdrop-blur-md'
          : 'border-zinc-600 bg-zinc-800 text-zinc-200',
      )}
    >
      <FileIcon />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{file.name}</div>
        {sizeLabel ? <div className="text-[10px] opacity-70">{sizeLabel}</div> : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            'rounded-md p-1 transition-colors',
            theme === 'geo' ? 'hover:bg-violet-500/25' : 'hover:bg-zinc-600',
          )}
          aria-label="Remove file"
        >
          <XIcon />
        </button>
      ) : null}
    </div>
  )
}

function messagePlainText(message: AgentMessage): string {
  return message.parts
    .map(p => (p.type === 'text' ? p.text : ''))
    .join('\n')
    .trim()
}

function DefaultMessageView({
  message,
  theme,
  assistantCopyEnabled,
}: {
  message: AgentMessage
  theme: 'default' | 'geo'
  assistantCopyEnabled?: boolean
}) {
  if (message.role === 'user') {
    return (
      <UserBubble theme={theme}>
        <div className="space-y-2 whitespace-pre-wrap break-words">
          {message.parts.map((p, i) =>
            p.type === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : p.image.previewUrl ? (
              <img
                key={i}
                src={p.image.previewUrl}
                alt={p.image.name ?? ''}
                className="max-h-48 max-w-full rounded-lg object-contain"
              />
            ) : null,
          )}
        </div>
      </UserBubble>
    )
  }

  if (message.role === 'assistant') {
    const text = messagePlainText(message)
    const showCopy =
      assistantCopyEnabled !== undefined ? assistantCopyEnabled : theme === 'geo'

    return (
      <div className="flex items-start gap-2.5">
        {theme === 'geo' ? <GeoGlobeAvatar /> : null}
        <div className="min-w-0 flex-1 space-y-2">
          <AssistantText theme={theme} copyText={text} showCopy={showCopy}>
            <div className="space-y-2 whitespace-pre-wrap break-words pr-14">
              {message.parts.map((p, i) =>
                p.type === 'text' ? (
                  <span key={i}>{p.text}</span>
                ) : p.image.previewUrl ? (
                  <img
                    key={i}
                    src={p.image.previewUrl}
                    alt={p.image.name ?? ''}
                    className="max-h-56 max-w-full rounded-lg object-contain"
                  />
                ) : null,
              )}
            </div>
          </AssistantText>
          {message.errorText ? (
            <ErrorBubble theme={theme}>{message.errorText}</ErrorBubble>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <ErrorBubble theme={theme}>
      <span className="font-semibold">System</span>
      <div className="mt-1 whitespace-pre-wrap">{messagePlainText(message)}</div>
    </ErrorBubble>
  )
}

export function MessageList({
  messages,
  theme = 'default',
  listHeader,
  listFooter,
  renderMessage,
  assistantCopyEnabled,
  className,
}: Pick<
  AgentChatProps,
  'messages' | 'theme' | 'listHeader' | 'listFooter' | 'renderMessage' | 'assistantCopyEnabled'
> & { className?: string }) {
  const t = theme ?? 'default'

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2',
        className,
      )}
    >
      {listHeader}
      {messages.map(msg => {
        const align =
          msg.role === 'user' ? 'justify-end' : msg.role === 'assistant' ? 'justify-start' : 'justify-center'
        return (
          <div key={msg.id} className={cn('flex w-full', align)}>
            {renderMessage ? (
              renderMessage(msg)
            ) : (
              <DefaultMessageView
                message={msg}
                theme={t}
                assistantCopyEnabled={assistantCopyEnabled}
              />
            )}
          </div>
        )
      })}
      {listFooter}
    </div>
  )
}

export function InputBar({
  theme = 'default',
  draft,
  onDraftChange,
  onSend,
  onStop,
  status,
  placeholder = 'Message…',
  disabled,
  attachedImages = [],
  attachedFiles = [],
  onRemoveImage,
  onRemoveFile,
  onAttachClick,
  error,
  maxTextareaRows = 6,
}: Pick<
  AgentChatProps,
  | 'theme'
  | 'draft'
  | 'onDraftChange'
  | 'onSend'
  | 'onStop'
  | 'status'
  | 'placeholder'
  | 'disabled'
  | 'attachedImages'
  | 'attachedFiles'
  | 'onRemoveImage'
  | 'onRemoveFile'
  | 'onAttachClick'
  | 'error'
  | 'maxTextareaRows'
>) {
  const t = theme ?? 'default'
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const busy = status === 'streaming' || status === 'submitting'
  const canSend =
    !disabled &&
    !busy &&
    (draft.trim().length > 0 || attachedImages.length > 0 || attachedFiles.length > 0)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const line = 22
    const maxH = line * maxTextareaRows
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`
  }, [maxTextareaRows])

  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onDraftChange(e.target.value)
      requestAnimationFrame(resize)
    },
    [onDraftChange, resize],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend) onSend()
      }
    },
    [canSend, onSend],
  )

  const shellClass =
    t === 'geo'
      ? cn(
          'rounded-3xl border border-violet-400/25 bg-violet-950/35 p-3 shadow-xl shadow-violet-950/40',
          'backdrop-blur-2xl',
        )
      : 'rounded-3xl border border-zinc-700/80 bg-zinc-900/90 p-3 shadow-lg shadow-black/20'

  return (
    <div className="space-y-2">
      {error ? (
        <div
          role="alert"
          className={cn(
            'rounded-xl px-3 py-2 text-sm',
            t === 'geo'
              ? 'border border-red-400/30 bg-red-950/40 text-red-100'
              : 'border border-red-500/35 bg-red-950/45 text-red-100',
          )}
        >
          {error}
        </div>
      ) : null}

      <div className={shellClass}>
        {(attachedImages.length > 0 || attachedFiles.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedImages.map(img => (
              <ImageChip
                key={img.id}
                image={img}
                theme={t}
                onRemove={onRemoveImage ? () => onRemoveImage(img.id) : undefined}
              />
            ))}
            {attachedFiles.map(f => (
              <FileChip
                key={f.id}
                file={f}
                theme={t}
                onRemove={onRemoveFile ? () => onRemoveFile(f.id) : undefined}
              />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {onAttachClick ? (
            <button
              type="button"
              onClick={onAttachClick}
              disabled={disabled || busy}
              className={cn(
                'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors',
                t === 'geo'
                  ? 'border border-violet-400/25 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25 disabled:opacity-40'
                  : 'border border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40',
              )}
              aria-label="Attach file"
            >
              <PaperclipIcon />
            </button>
          ) : null}

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled || busy}
            rows={1}
            className={cn(
              'min-h-[44px] flex-1 resize-none bg-transparent text-[15px] outline-none',
              'placeholder:text-zinc-500',
              t === 'geo' && 'text-violet-50 placeholder:text-violet-300/40',
            )}
          />

          {status === 'streaming' && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className={cn(
                'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors',
                t === 'geo'
                  ? 'bg-violet-500 text-white hover:bg-violet-400'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-white',
              )}
              aria-label="Stop generating"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className={cn(
                'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                t === 'geo'
                  ? 'bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-900/50 hover:from-violet-400 hover:to-fuchsia-500'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-white',
              )}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentChatInner(props: AgentChatProps) {
  const {
    theme = 'default',
    messages,
    status,
    draft,
    onDraftChange,
    onSend,
    onStop,
    attachedImages,
    attachedFiles,
    onRemoveImage,
    onRemoveFile,
    onAttachClick,
    error,
    placeholder,
    listHeader,
    listFooter,
    renderMessage,
    hideInput,
    inputSlot,
    className,
    listClassName,
    disabled,
    maxTextareaRows,
    assistantCopyEnabled,
  } = props

  const t = theme ?? 'default'

  const list = useMemo(
    () => (
      <MessageList
        messages={messages}
        theme={t}
        listHeader={listHeader}
        listFooter={listFooter}
        renderMessage={renderMessage}
        assistantCopyEnabled={assistantCopyEnabled}
        className={listClassName}
      />
    ),
    [
      messages,
      t,
      listHeader,
      listFooter,
      renderMessage,
      assistantCopyEnabled,
      listClassName,
    ],
  )

  const input =
    inputSlot ??
    (!hideInput ? (
      <InputBar
        theme={t}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onStop={onStop}
        status={status}
        placeholder={placeholder}
        disabled={disabled}
        attachedImages={attachedImages}
        attachedFiles={attachedFiles}
        onRemoveImage={onRemoveImage}
        onRemoveFile={onRemoveFile}
        onAttachClick={onAttachClick}
        error={error}
        maxTextareaRows={maxTextareaRows}
      />
    ) : null)

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col gap-3',
        t === 'geo' && 'text-violet-50',
        className,
      )}
    >
      {list}
      {input}
    </div>
  )
}

export const AgentChat = memo(AgentChatInner)
AgentChat.displayName = 'AgentChat'

export default AgentChat
