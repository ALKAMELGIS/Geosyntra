import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react'
import type { GeoExplorerMessage } from '../../../lib/geoExplorerGemini'
import type { SmartSuggestionsContext } from '../utils/smartSuggestionsEngine'
import type { SmartSuggestionActionPayload } from './smart-suggestions/smart-suggestions-panel'
import {
  buildConversationalFlow,
  pickConversationalStep,
} from '../utils/geoConversationalCoach'
import {
  GeoExplorerGeminiMessageParts,
  type GeoExplorerGeminiMessagePartsProps,
} from './GeoExplorerGeminiMessageParts'
import type { GeoAiVoiceGisIntent } from '../../../lib/geoAiVoiceGisIntent'
import { GeoExplorerGeminiInputRow } from './GeoExplorerGeminiInputRow'
import { GeoConversationalCoach } from './GeoConversationalCoach'
import { SiCopyTextButton } from './SiCopyTextButton'
import './GeoConversationalCoach.css'
import './geoAgentChat.css'
import './geo-chat-google.css'

export type SiGeoExplorerChatPanelProps = {
  messagesRef: RefObject<HTMLDivElement | null>
  hasOlderMessages: boolean
  onLoadOlder: () => void
  onScrollNearTop: () => void
  welcomeText: string
  welcomeAvatarIcon: string
  modelAvatarIcon: string
  messages: GeoExplorerMessage[]
  busy: boolean
  typingLabel?: string
  error: string | null
  draft: string
  onDraftChange: (next: string) => void
  onSend: (voiceOverrideText?: string) => void
  pendingImage: { mime: string; base64: string } | null
  onClearPendingImage?: () => void
  fileInputRef?: RefObject<HTMLInputElement | null>
  onAttachChange?: (e: ChangeEvent<HTMLInputElement>) => void
  showAttach?: boolean
  placeholder?: string
  textareaAriaLabel: string
  messagePartsProps: Omit<GeoExplorerGeminiMessagePartsProps, 'msg' | 'cssPrefix'>
  footnote?: ReactNode
  availableLayers?: string[]
  availableFields?: string[]
  availableNumericFields?: string[]
  availableGeometryOps?: string[]
  smartSuggestionsEnabled?: boolean
  smartSuggestionsContext?: Partial<SmartSuggestionsContext>
  onSmartSuggestionAction?: (actionId: string, payload: SmartSuggestionActionPayload) => void
  groundingChips?: string[]
  groundingStatusLabel?: string | null
  onGroundingChipSelect?: (text: string) => void
  onVoiceGisIntent?: (intent: GeoAiVoiceGisIntent, spokenText: string) => void
}

export function SiGeoExplorerChatPanel(props: SiGeoExplorerChatPanelProps) {
  const {
    messagesRef,
    hasOlderMessages,
    onLoadOlder,
    onScrollNearTop,
    welcomeText,
    welcomeAvatarIcon,
    modelAvatarIcon,
    messages,
    busy,
    typingLabel = 'Thinking…',
    error,
    draft,
    onDraftChange,
    onSend,
    pendingImage,
    onClearPendingImage,
    fileInputRef,
    onAttachChange,
    showAttach = true,
    placeholder,
    textareaAriaLabel,
    messagePartsProps,
    footnote,
    availableLayers,
    availableFields,
    availableNumericFields,
    availableGeometryOps,
    smartSuggestionsEnabled = true,
    smartSuggestionsContext,
    onSmartSuggestionAction,
    groundingChips,
    groundingStatusLabel,
    onGroundingChipSelect,
    onVoiceGisIntent,
  } = props

  const [coachStepIndex, setCoachStepIndex] = useState(0)
  const [coachDismissed, setCoachDismissed] = useState(false)

  const mergedSmartContext = useMemo(
    (): SmartSuggestionsContext => ({
      draft,
      availableLayers: availableLayers ?? [],
      availableFields: availableFields ?? [],
      availableNumericFields: availableNumericFields ?? [],
      availableGeometryOps: availableGeometryOps ?? [],
      ...smartSuggestionsContext,
    }),
    [
      draft,
      availableLayers,
      availableFields,
      availableNumericFields,
      availableGeometryOps,
      smartSuggestionsContext,
    ],
  )

  const flowKey = useMemo(
    () =>
      [
        (groundingChips ?? []).join('|'),
        messages.length,
        smartSuggestionsEnabled ? '1' : '0',
        mergedSmartContext.hasAoi ? 'aoi' : '',
        mergedSmartContext.activeLayerId ?? '',
      ].join('·'),
    [groundingChips, messages.length, smartSuggestionsEnabled, mergedSmartContext],
  )

  useEffect(() => {
    setCoachStepIndex(0)
    setCoachDismissed(false)
  }, [flowKey])

  const conversationalSteps = useMemo(
    () =>
      buildConversationalFlow({
        groundingChips,
        smartContext: mergedSmartContext,
        smartEnabled: smartSuggestionsEnabled,
        hasConversation: messages.length > 0,
      }),
    [groundingChips, mergedSmartContext, smartSuggestionsEnabled, messages.length],
  )

  const coachStep = useMemo(
    () => pickConversationalStep(conversationalSteps, coachStepIndex),
    [conversationalSteps, coachStepIndex],
  )

  const showCoach =
    !coachDismissed &&
    !busy &&
    !draft.trim() &&
    conversationalSteps.length > 0 &&
    Boolean(onGroundingChipSelect || smartSuggestionsEnabled)

  const applyCoachInsert = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t) return
      if (onGroundingChipSelect) {
        onGroundingChipSelect(t)
      } else {
        onDraftChange(draft.trim() ? `${draft.trim()} ${t}` : t)
        onSend()
      }
      setCoachStepIndex(i => i + 1)
    },
    [onGroundingChipSelect, onDraftChange, onSend, draft],
  )

  const groundingActive = Boolean(groundingStatusLabel && (groundingChips?.length ?? 0) > 0)

  return (
    <div className="geo-chat-overlay-layout">
      <div
        className="si-geo-explorer-messages geo-agent-chat geo-agent-chat--google geo-chat-overlay-layout__thread"
        ref={messagesRef}
        onScroll={() => {
          const el = messagesRef.current
          if (!el) return
          if (el.scrollTop <= 24) onScrollNearTop()
        }}
      >
        <div className="geo-chat-thread-spacer" aria-hidden />
        {hasOlderMessages ? (
          <button
            type="button"
            className="si-geo-explorer-load-more"
            onClick={onLoadOlder}
            aria-label="Load older messages"
          >
            Load earlier messages
          </button>
        ) : null}
        <div className="si-geo-explorer-row si-geo-explorer-row--model geo-chat-welcome-row">
          <div className="si-geo-explorer-avatar geo-chat-welcome-avatar" aria-hidden>
            <i className={welcomeAvatarIcon} />
          </div>
          <div className="si-geo-explorer-bubble si-geo-explorer-bubble--welcome geo-chat-welcome-bubble">
            <div className="si-geo-explorer-bubble-with-copy">
              <p className="si-geo-explorer-bubble-text geo-chat-welcome-text">{welcomeText}</p>
              <SiCopyTextButton
                text={welcomeText}
                className="si-geo-explorer-bubble-copy-btn"
                title="Copy intro"
                ariaLabel="Copy welcome text"
                variant="compact"
              />
            </div>
          </div>
        </div>
        {messages.map(msg => (
          <div key={msg.id} className={`si-geo-explorer-row si-geo-explorer-row--${msg.role}`}>
            {msg.role === 'model' ? (
              <div className="si-geo-explorer-avatar" aria-hidden>
                <i className={modelAvatarIcon} />
              </div>
            ) : null}
            <div className="si-geo-explorer-bubble">
              <GeoExplorerGeminiMessageParts msg={msg} cssPrefix="si-geo-explorer" {...messagePartsProps} />
            </div>
          </div>
        ))}
        {busy ? (
          <div className="si-geo-explorer-row si-geo-explorer-row--model" aria-busy="true">
            <div className="si-geo-explorer-avatar" aria-hidden>
              <i className={modelAvatarIcon} />
            </div>
            <div className="si-geo-explorer-bubble si-geo-explorer-bubble--typing" role="status" aria-live="polite">
              <span className="si-geo-explorer-typing-dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span className="si-geo-explorer-typing-label">{typingLabel}</span>
            </div>
          </div>
        ) : null}
        <GeoConversationalCoach
          step={coachStep}
          stepIndex={coachStepIndex}
          totalSteps={conversationalSteps.length}
          groundingActive={groundingActive}
          disabled={busy}
          hidden={!showCoach}
          onUse={applyCoachInsert}
          onNext={() => setCoachStepIndex(i => i + 1)}
          onDismiss={() => setCoachDismissed(true)}
        />
      </div>
      <div className="geo-chat-overlay-layout__footer">
        {error ? (
          <div className="si-geo-explorer-error-row" role="alert">
            <p className="si-geo-explorer-error">{error}</p>
            <SiCopyTextButton
              text={error}
              className="si-geo-explorer-error-copy-btn"
              title="Copy error message"
              ariaLabel="Copy error text"
              variant="compact"
            />
          </div>
        ) : null}
        {pendingImage && onClearPendingImage ? (
          <p className="si-geo-explorer-pending-img">
            <i className="fa-solid fa-image" aria-hidden /> Image ready to send
            <button type="button" className="si-geo-explorer-linkish" onClick={onClearPendingImage}>
              Remove
            </button>
          </p>
        ) : null}
        <GeoExplorerGeminiInputRow
          cssPrefix="si-geo-explorer"
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={onSend}
          busy={busy}
          pendingImage={pendingImage}
          fileInputRef={fileInputRef}
          onAttachChange={onAttachChange}
          showAttach={showAttach}
          placeholder={placeholder}
          textareaAriaLabel={textareaAriaLabel}
          availableLayers={availableLayers}
          availableFields={availableFields}
          availableNumericFields={availableNumericFields}
          availableGeometryOps={availableGeometryOps}
          smartSuggestionsEnabled={smartSuggestionsEnabled}
          smartSuggestionsContext={mergedSmartContext}
          onSmartSuggestionAction={onSmartSuggestionAction}
          onVoiceGisIntent={onVoiceGisIntent}
          conversationalCoachActive={showCoach}
        />
        {footnote}
      </div>
    </div>
  )
}
