import { useCallback, useEffect, useRef } from 'react'
import { useGeoAiSpeechRecognition } from '../hooks/useGeoAiSpeechRecognition'
import {
  formatGeoAiVoiceGisIntentJson,
  geoAiPromptFromVoiceGisIntent,
  parseGeoAiVoiceGisIntent,
  type GeoAiVoiceGisIntent,
} from '../lib/geoAiVoiceGisIntent'
import './GeoAiVoiceInput.css'

export type GeoAiVoiceInputProps = {
  disabled?: boolean
  /** Final transcript text (normalized). */
  onResult: (text: string) => void
  /** Structured GIS intent derived from speech (rule-based). */
  onGisIntent?: (intent: GeoAiVoiceGisIntent, spokenText: string) => void
  /** When true, append JSON intent to composer for debugging / agent context. */
  emitIntentJson?: boolean
  className?: string
  showLangToggle?: boolean
  onVoiceStateChange?: (state: {
    listening: boolean
    interimTranscript: string
    supported: boolean
    lang: string
  }) => void
}

export { GeoAiVoiceInput as VoiceInput }

/**
 * Glass-style microphone control for Geo AI chat (Web Speech API).
 */
export function GeoAiVoiceInput({
  disabled = false,
  onResult,
  onGisIntent,
  emitIntentJson = false,
  className = '',
  showLangToggle = true,
  onVoiceStateChange,
}: GeoAiVoiceInputProps) {
  const voice = useGeoAiSpeechRecognition({
    disabled,
    onFinalTranscript: text => {
      const spoken = text.trim()
      if (!spoken) return
      const intent = parseGeoAiVoiceGisIntent(spoken)
      onGisIntent?.(intent, spoken)
      const prompt = geoAiPromptFromVoiceGisIntent(intent)
      onResult(emitIntentJson ? `${prompt}\n${formatGeoAiVoiceGisIntentJson(intent)}` : prompt)
    },
  })

  const onVoiceStateChangeRef = useRef(onVoiceStateChange)
  onVoiceStateChangeRef.current = onVoiceStateChange
  useEffect(() => {
    onVoiceStateChangeRef.current?.({
      listening: voice.listening,
      interimTranscript: voice.interimTranscript,
      supported: voice.supported,
      lang: voice.lang,
    })
  }, [voice.listening, voice.interimTranscript, voice.supported, voice.lang])

  const onMicClick = useCallback(() => {
    if (voice.listening) voice.stopListening()
    else {
      voice.clearError()
      voice.startListening()
    }
  }, [voice])

  const speechLangArabic = voice.lang.toLowerCase().startsWith('ar')
  const capturing = voice.listening && Boolean(voice.interimTranscript.trim())
  const state = !voice.supported ? 'unsupported' : voice.listening ? (capturing ? 'capturing' : 'listening') : 'idle'

  return (
    <div className={`geo-ai-voice-input ${className}`.trim()} data-voice-state={state}>
      <button
        type="button"
        className={
          'geo-ai-voice-input__mic' +
          (voice.listening ? ' geo-ai-voice-input__mic--active' : '') +
          (capturing ? ' geo-ai-voice-input__mic--live' : '') +
          (!voice.supported ? ' geo-ai-voice-input__mic--muted' : '')
        }
        onClick={onMicClick}
        disabled={disabled}
        aria-pressed={voice.listening}
        aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
        title={
          voice.supported
            ? `${voice.listening ? 'Stop' : 'Start'} voice (${speechLangArabic ? 'Arabic' : 'English'})`
            : 'Voice not supported in this browser'
        }
      >
        <i className="fa-solid fa-microphone" aria-hidden />
        {voice.listening ? <span className="geo-ai-voice-input__pulse" aria-hidden /> : null}
      </button>
      {showLangToggle ? (
        <button
          type="button"
          className="geo-ai-voice-input__lang"
          onClick={() => {
            voice.cycleLang()
            voice.clearError()
          }}
          disabled={disabled}
          aria-label={`Speech language: ${speechLangArabic ? 'Arabic' : 'English'}. Switch.`}
          title={`${speechLangArabic ? 'Arabic' : 'English'} — click to toggle`}
        >
          <i className="fa-solid fa-language" aria-hidden />
          <span>{speechLangArabic ? 'AR' : 'EN'}</span>
        </button>
      ) : null}
      {voice.error ? <p className="geo-ai-voice-input__error">{voice.error}</p> : null}
    </div>
  )
}
