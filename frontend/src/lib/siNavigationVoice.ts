let lastSpoken = ''

export function speakNavigationInstruction(text: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return
  const t = text.trim()
  if (!t || t === lastSpoken) return
  lastSpoken = t
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t)
    u.rate = 1.05
    u.pitch = 1
    window.speechSynthesis.speak(u)
  } catch {
    /* ignore */
  }
}

export function stopNavigationVoice(): void {
  lastSpoken = ''
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}
