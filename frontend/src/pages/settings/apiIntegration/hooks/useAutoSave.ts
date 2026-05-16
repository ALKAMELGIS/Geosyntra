import { useEffect, useRef, useState } from 'react'
import type { IntegrationDraft } from '../types'
import { clearDraft, saveDraft } from '../integrationStore'

const AUTO_SAVE_MS = 900

export function useAutoSave(draft: IntegrationDraft, enabled: boolean) {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setSaving(true)
      saveDraft(draft)
      setLastSavedAt(new Date())
      setSaving(false)
    }, AUTO_SAVE_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [draft, enabled])

  const discardDraft = () => clearDraft()

  return { lastSavedAt, saving, discardDraft }
}
