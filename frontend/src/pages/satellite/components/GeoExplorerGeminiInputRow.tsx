import type { ChangeEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGeoAiSpeechRecognition } from '../../../hooks/useGeoAiSpeechRecognition'
import type { GeoExplorerCssPrefix } from './GeoExplorerGeminiChatBody'

export type GeoExplorerGeminiInputRowProps = {
  cssPrefix: GeoExplorerCssPrefix
  draft: string
  onDraftChange: (next: string) => void
  /** Send using current draft + attachments, or pass final voice text (skips stale draft read). */
  onSend: (voiceOverrideText?: string) => void
  busy: boolean
  /** When `showAttach` is true, image attach is shown and pending image gates Send. */
  pendingImage: { mime: string; base64: string } | null
  fileInputRef?: RefObject<HTMLInputElement | null>
  onAttachChange?: (e: ChangeEvent<HTMLInputElement>) => void
  textareaAriaLabel: string
  showAttach?: boolean
  enableVoice?: boolean
  /** Overrides default Geo AI placeholder (Claude / DeepSeek prompts). */
  placeholder?: string
  /** Dynamic context for smart suggestions/help words. */
  availableFields?: string[]
  availableNumericFields?: string[]
  availableLayers?: string[]
  availableGeometryOps?: string[]
  smartSuggestionsEnabled?: boolean
}

function pfx(prefix: GeoExplorerCssPrefix, part: string): string {
  return `${prefix}-${part}`
}

const RECENT_LS_KEY = 'geo_ai_suggestions_recent_v1'
const MAX_VISIBLE = 6
const PROGRESSIVE_MS = 380

type RankedChip = {
  key: string
  /** Shown in UI */
  label: string
  /** Inserted into draft */
  insert: string
  tier: 'guide' | 'recent' | 'context' | 'op' | 'spatial' | 'help'
  score: number
}

function readRecentScores(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECENT_LS_KEY) : null
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function bumpRecent(insert: string) {
  try {
    const key = RECENT_LS_KEY
    const rec = readRecentScores()
    rec[insert] = (rec[insert] ?? 0) + 1
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(rec))
  } catch {
    /* ignore */
  }
}

function normalizeChipKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

type OptimizePack = {
  refined: string
  /** Short natural prompts users can tap */
  examples: string[]
  stats: string[]
  math: string[]
  spatial: string[]
}

function buildOptimizePack(
  draft: string,
  layers: string[],
  fields: string[],
  numericFields: string[],
  geometryOps: string[],
): OptimizePack {
  const layer = layers[0]
  const num = numericFields[0] ?? fields.find(f => /\b(area|total|count|sum|length|width|height|amount|price|qty)\b/i.test(f)) ?? fields[0] ?? 'NumericField'
  const cat =
    fields.find(f => f !== num && !numericFields.includes(f)) ?? fields.find(f => f !== num) ?? 'Farm_Code'
  const layerPhrase = layer ? ` on layer "${layer}"` : ''

  const stats = [
    `Count records${layerPhrase}`,
    `SUM(${num})${layerPhrase}`,
    `Average ${num}${layerPhrase}`,
    `Group by ${cat}`,
    `Min ${num} and Max ${num}${layerPhrase}`,
  ]
  const math = [`${num} < 3000`, `${num} > 100`, `${cat} = MH101`, `${num} >= 500 and ${num} <= 2000`]
  const spatial = geometryOps.slice(0, 5).map(op => `${op}: describe boundary then filter attributes`)

  const d = draft.trim()
  let refined = ''
  if (!d) {
    refined = `SUM(${num}) where ${num} < 3000${layerPhrase}`
  } else if (/sum|total|مجموع|اجمالي/i.test(d) && !/\b(where|>|<|>=|<=|=)\b/i.test(d)) {
    refined = `${d.trim()} where ${num} < 3000`
  } else if (/count|عدد/i.test(d) && layer) {
    refined = `Count records${layerPhrase}`
  } else if (/group|تجميع/i.test(d)) {
    refined = `Group by ${cat}${layerPhrase}`
  } else {
    refined = `${d.trim()} — specify layer (${layer ?? '…'}), field (${num}), and comparison for sharper stats`
  }

  const examples: string[] = []
  if (layer) {
    examples.push(`ما الذي أريد معرفته عن "${layer}" بالتحديد؟`)
    examples.push(`How many records are in "${layer}", and should we group by ${cat}?`)
    examples.push(`What totals do I need for ${num} on "${layer}"?`)
  } else {
    examples.push(`أي طبقة نبدأ بتحليلها؟`)
    examples.push(`I want to summarize my data — what should we measure first?`)
  }
  examples.push(`Compare ${num} across ${cat}.`)

  return { refined, examples, stats, math, spatial }
}

const TIER_SORT: Record<RankedChip['tier'], number> = {
  guide: 60,
  help: 45,
  context: 40,
  recent: 30,
  op: 20,
  spatial: 15,
}

function relevanceBonus(q: string, label: string): number {
  if (!q) return 0
  const L = label.toLowerCase()
  const Q = q.toLowerCase()
  if (!Q) return 0
  if (L.startsWith(Q)) return 22
  if (L.includes(Q)) return 12
  let bonus = 0
  for (const tok of Q.split(/\s+/).filter(t => t.length > 1)) {
    if (L.includes(tok)) bonus += 6
  }
  return bonus
}

/**
 * Geo AI / Geo Explorer composer: textarea for text, floating voice/lang dock beside it, attach + send.
 */
export function GeoExplorerGeminiInputRow(props: GeoExplorerGeminiInputRowProps) {
  const {
    cssPrefix,
    draft,
    onDraftChange,
    onSend,
    busy,
    pendingImage,
    fileInputRef,
    onAttachChange,
    textareaAriaLabel,
    showAttach = true,
    enableVoice = true,
    placeholder = 'Describe a place, ask for directions, or plan a trip…',
    availableFields = [],
    availableNumericFields = [],
    availableLayers = [],
    availableGeometryOps = ['Within', 'Intersects', 'Buffer', 'Contains'],
    smartSuggestionsEnabled = true,
  } = props

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const optimizeWrapRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [composerFocused, setComposerFocused] = useState(false)
  const [progressiveCap, setProgressiveCap] = useState(3)
  const [chipFocusIdx, setChipFocusIdx] = useState<number | null>(null)
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  const voice = useGeoAiSpeechRecognition({
    disabled: busy || !enableVoice,
    onFinalTranscript: text => {
      const t = text.trim()
      if (!t) return
      onDraftChange(t)
      onSend(t)
    },
  })

  const onMicClick = () => {
    if (voice.listening) voice.stopListening()
    else {
      voice.clearError()
      voice.startListening()
    }
  }

  const speechLangArabic = voice.lang.toLowerCase().startsWith('ar')
  const voiceUiState: 'idle' | 'listening' | 'capturing' =
    !enableVoice || busy ? 'idle' : voice.listening ? (voice.interimTranscript.trim() ? 'capturing' : 'listening') : 'idle'

  const interimPreview =
    voice.interimTranscript.trim().length > 56 ? `${voice.interimTranscript.trim().slice(0, 54)}…` : voice.interimTranscript.trim()

  const qRaw = draft.trim()
  const q = qRaw.toLowerCase()

  const recentMap = useMemo(() => readRecentScores(), [draft])

  const rankedChips = useMemo((): RankedChip[] => {
    const dedupe = new Map<string, RankedChip>()
    const push = (c: RankedChip) => {
      const k = normalizeChipKey(c.key)
      const prev = dedupe.get(k)
      if (!prev || c.score > prev.score) dedupe.set(k, { ...c, key: k })
    }

    const recentBoost = (insert: string, base: number, tier: RankedChip['tier']) => {
      const uses = recentMap[insert] ?? recentMap[insert.replace(/^Field:\s*/i, '').trim()] ?? 0
      const rb = uses > 0 ? Math.min(18, 5 + Math.log10(uses + 1) * 8) : 0
      return base + rb + relevanceBonus(qRaw, insert) + relevanceBonus(qRaw, insert.replace(/^Field:\s*/i, ''))
    }

    const calcIntent =
      /احسب|calculate|sum|average|mean|count|min|max|statistics|stat\b|group\s*by|مجموع|متوسط|عدد|إحصاء|احص|تلخيص|total\b/i.test(qRaw)
    const filterIntent =
      /حدد|select|where|filter|>|<|=|!|within|intersects|contains|buffer|اكبر|اصغر|أكبر|أصغر|تصفية|عرض السجلات/i.test(qRaw)
    const spatialHint =
      /within|intersects|contains|buffer|clip|spatial|boundary|map|نطاق|خريطة|مكان|geometry/i.test(qRaw)
    const focusedOrTyping = composerFocused || qRaw.length > 0

    if (!focusedOrTyping && !qRaw) {
      return []
    }

    const showHeavyOps =
      calcIntent ||
      filterIntent ||
      spatialHint ||
      qRaw.length > 28 ||
      (/\d/.test(qRaw) && /[<>=]/.test(qRaw))

    const sortByTierThenScore = (rows: RankedChip[]) =>
      rows.sort((a, b) => {
        const td = TIER_SORT[b.tier] - TIER_SORT[a.tier]
        if (td !== 0) return td
        return b.score - a.score
      })

    /** Focused empty draft → guide-first (no math/stat spam) */
    const guideQuiet = composerFocused && qRaw.length === 0 && !calcIntent && !filterIntent
    if (guideQuiet) {
      const guides: Array<[string, string]> = [
        ['ما الذي تريد تحليله؟', 'ما الذي تريد تحليله بالضبط؟ '],
        ['اختر طبقة أو حقل', 'الطبقة أو الحقل المطلوب: '],
        ['تلخيص · Summarize', 'تلخيص النتائج: '],
        ['مقارنة · Compare', 'مقارنة بين '],
        ['تصفية · Filter', 'عرض السجلات حيث '],
        ['عدّ السجلات', 'كم عدد السجلات '],
      ]
      guides.forEach(([label, insert], i) =>
        push({
          key: `guide-${i}-${label}`,
          label,
          insert,
          tier: 'guide',
          score: 96 - i,
        }),
      )

      const topRecent = Object.entries(recentMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([insert]) => ({
          key: insert,
          label: insert.length > 26 ? `${insert.slice(0, 24)}…` : insert,
          insert,
          tier: 'recent' as const,
          score: recentBoost(insert, 74, 'recent'),
        }))
      for (const c of topRecent) push(c)

      if (availableLayers.length) {
        for (const l of availableLayers.slice(0, 2)) {
          const insert = l.includes(' ') ? `Layer: "${l}"` : `Layer: ${l}`
          push({
            key: insert,
            label: `Layer · ${l.length > 22 ? `${l.slice(0, 20)}…` : l}`,
            insert,
            tier: 'context',
            score: recentBoost(insert, 70, 'context'),
          })
        }
      }

      return sortByTierThenScore([...dedupe.values()])
    }

    /** Short ambiguous drafts → nudge phrasing before ops */
    const softGuide = !calcIntent && !filterIntent && !spatialHint && qRaw.length > 0 && qRaw.length <= 26
    if (softGuide) {
      push({
        key: 'guide-clarify',
        label: 'وضّح النتيجة · Clarify goal',
        insert: ' الهدف: ',
        tier: 'guide',
        score: 90,
      })
      push({
        key: 'guide-layer',
        label: 'حدّد الطبقة · Pick layer',
        insert: 'الطبقة: ',
        tier: 'guide',
        score: 86,
      })
    }

    const topRecent = Object.entries(recentMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, showHeavyOps ? 5 : 3)
      .map(([insert]) => ({
        key: insert,
        label: insert.length > 28 ? `${insert.slice(0, 26)}…` : insert,
        insert,
        tier: 'recent' as const,
        score: recentBoost(insert, 79, 'recent'),
      }))
    for (const c of topRecent) push(c)

    if (availableLayers.length && (qRaw.length >= 2 || calcIntent || filterIntent)) {
      const layerCap = showHeavyOps ? 4 : 3
      const layers =
        qRaw.length >= 2
          ? availableLayers.filter(l => l.toLowerCase().includes(q)).slice(0, layerCap)
          : availableLayers.slice(0, Math.min(3, layerCap))
      for (const l of layers) {
        const insert = l.includes(' ') ? `Layer: "${l}"` : `Layer: ${l}`
        push({
          key: insert,
          label: `Layer · ${l.length > 22 ? `${l.slice(0, 20)}…` : l}`,
          insert,
          tier: 'context',
          score: recentBoost(insert, 73, 'context'),
        })
      }
    }

    if (availableFields.length && qRaw.length >= 2) {
      const fieldCap = showHeavyOps ? 4 : 3
      const fields = availableFields.filter(f => f.toLowerCase().includes(q)).slice(0, fieldCap)
      for (const f of fields) {
        const insert = `Field: ${f}`
        push({
          key: insert,
          label: `Field · ${f.length > 22 ? `${f.slice(0, 20)}…` : f}`,
          insert,
          tier: 'context',
          score: recentBoost(insert, 69, 'context'),
        })
      }
    }

    if (availableNumericFields.length && (calcIntent || qRaw.length >= 2)) {
      const maxN = showHeavyOps ? 3 : 2
      const nums =
        qRaw.length >= 2
          ? availableNumericFields.filter(f => f.toLowerCase().includes(q)).slice(0, maxN)
          : availableNumericFields.slice(0, Math.min(2, maxN))
      for (const f of nums) {
        const insert = `Numeric: ${f}`
        push({
          key: insert,
          label: `# ${f.length > 18 ? `${f.slice(0, 16)}…` : f}`,
          insert,
          tier: 'context',
          score: recentBoost(insert, 63, 'context'),
        })
      }
    }

    const aggLabels: Array<[string, string]> = [
      ['مجموع · Sum', 'Sum'],
      ['متوسط · Average', 'Average'],
      ['عدد · Count', 'Count'],
      ['أدنى · Min', 'Min'],
      ['أقصى · Max', 'Max'],
      ['تجميع حسب · Group By', 'Group By'],
    ]

    if (calcIntent || qRaw.length > 22) {
      const aggPick = calcIntent ? aggLabels : aggLabels.slice(0, 4)
      for (const [label, insert] of aggPick) {
        push({
          key: insert,
          label,
          insert,
          tier: 'op',
          score: recentBoost(insert, calcIntent ? 58 : 44, 'op'),
        })
      }
    }

    const cmpHeavy = filterIntent || spatialHint || /[><=!]/.test(qRaw)
    if (cmpHeavy) {
      const cmpAll = ['>', '<', '>=', '<=', '=', '!=']
      const cmpPick = qRaw.length >= 2 || filterIntent ? cmpAll : cmpAll.slice(0, 4)
      for (const op of cmpPick) {
        push({
          key: op,
          label: op,
          insert: op,
          tier: 'op',
          score: recentBoost(op, filterIntent ? 54 : 40, 'op'),
        })
      }
    }

    if ((filterIntent || spatialHint) && availableGeometryOps.length) {
      const geoCap = Math.min(showHeavyOps ? 5 : 3, availableGeometryOps.length)
      for (const g of availableGeometryOps.slice(0, geoCap)) {
        push({
          key: g,
          label: g,
          insert: g,
          tier: 'spatial',
          score: recentBoost(g, filterIntent ? 52 : 38, 'spatial'),
        })
      }
    }

    return sortByTierThenScore([...dedupe.values()])
  }, [
    q,
    qRaw,
    composerFocused,
    recentMap,
    availableFields,
    availableNumericFields,
    availableLayers,
    availableGeometryOps,
  ])

  const visibleChips = useMemo(() => rankedChips.slice(0, Math.min(progressiveCap, MAX_VISIBLE)), [rankedChips, progressiveCap])

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    if (reduced) {
      setProgressiveCap(MAX_VISIBLE)
      return
    }
    setProgressiveCap(3)
    const t = window.setTimeout(() => setProgressiveCap(MAX_VISIBLE), PROGRESSIVE_MS)
    return () => window.clearTimeout(t)
  }, [qRaw, composerFocused])

  useEffect(() => {
    chipRefs.current = []
  }, [visibleChips.length])

  const showSuggestPanel =
    smartSuggestionsEnabled && !busy && (composerFocused || qRaw.length > 0) && visibleChips.length > 0

  const showOptimizeChrome =
    smartSuggestionsEnabled && !busy && (composerFocused || qRaw.length > 0)

  const optimizePack = useMemo(
    () => buildOptimizePack(qRaw, availableLayers, availableFields, availableNumericFields, availableGeometryOps),
    [qRaw, availableLayers, availableFields, availableNumericFields, availableGeometryOps],
  )

  useEffect(() => {
    if (!optimizeOpen) return
    const onDocMouseDown = (ev: Event) => {
      const el = optimizeWrapRef.current
      const t = ev.target
      if (!el || !(t instanceof Node) || el.contains(t)) return
      setOptimizeOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [optimizeOpen])

  useEffect(() => {
    if (!showSuggestPanel) setChipFocusIdx(null)
    else if (chipFocusIdx != null && chipFocusIdx >= visibleChips.length) setChipFocusIdx(visibleChips.length - 1)
  }, [showSuggestPanel, visibleChips.length, chipFocusIdx])

  const applySuggestion = useCallback(
    (insert: string) => {
      const clean = insert.replace(/^Field:\s*/i, '').replace(/^Layer:\s*/i, '').replace(/^Numeric:\s*/i, '')
      const next = draft.trim() ? `${draft} ${clean}` : clean
      onDraftChange(next)
      bumpRecent(clean)
      setChipFocusIdx(null)
      textareaRef.current?.focus()
    },
    [draft, onDraftChange],
  )

  const applyReplaceDraft = useCallback(
    (next: string) => {
      const t = next.trim()
      if (!t) return
      onDraftChange(t)
      textareaRef.current?.focus()
    },
    [onDraftChange],
  )

  const toggleOptimize = useCallback((ev: ReactMouseEvent) => {
    ev.preventDefault()
    setOptimizeOpen(o => !o)
  }, [])

  useEffect(() => {
    if (!optimizeOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOptimizeOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [optimizeOpen])

  const renderOptimizeTrigger = () => (
    <button
      type="button"
      className={`${pfx(cssPrefix, 'optimize-input-btn')} ${optimizeOpen ? pfx(cssPrefix, 'optimize-input-btn--open') : ''}`}
      onMouseDown={ev => ev.preventDefault()}
      onClick={toggleOptimize}
      aria-expanded={optimizeOpen}
      aria-haspopup="dialog"
      aria-label="Examples and wording — أمثلة وصياغة"
      title="Examples, wording, and advanced formulas"
    >
      <i className="fa-solid fa-sparkles" aria-hidden />
      <span className={pfx(cssPrefix, 'optimize-input-btn-label')}>Examples</span>
    </button>
  )

  const insertFromOptimize = useCallback(
    (text: string, mode: 'append' | 'replace') => {
      const t = text.trim()
      if (!t) return
      if (mode === 'replace') applyReplaceDraft(t)
      else applySuggestion(t)
      setOptimizeOpen(false)
    },
    [applyReplaceDraft, applySuggestion],
  )

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestPanel || !visibleChips.length) return

    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1
      const chip = visibleChips[idx]
      if (chip) {
        e.preventDefault()
        applySuggestion(chip.insert)
      }
      return
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      e.preventDefault()
      setChipFocusIdx(0)
      requestAnimationFrame(() => chipRefs.current[0]?.focus())
    }
  }

  const onChipKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(idx + 1, visibleChips.length - 1)
      setChipFocusIdx(next)
      chipRefs.current[next]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx <= 0) {
        setChipFocusIdx(null)
        textareaRef.current?.focus()
      } else {
        const prev = idx - 1
        setChipFocusIdx(prev)
        chipRefs.current[prev]?.focus()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setChipFocusIdx(null)
      textareaRef.current?.focus()
    }
  }

  const optimizePopover = optimizeOpen ? (
    <div
      className={pfx(cssPrefix, 'optimize-popover')}
      role="dialog"
      aria-label="Question guide — دليل الصياغة"
      onMouseDown={ev => ev.preventDefault()}
    >
      <div className={pfx(cssPrefix, 'optimize-popover-head')}>
        <span className={pfx(cssPrefix, 'optimize-popover-title')}>Guide · دليل الصياغة</span>
        <button
          type="button"
          className={pfx(cssPrefix, 'optimize-popover-close')}
          aria-label="Close"
          onClick={() => setOptimizeOpen(false)}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      <p className={pfx(cssPrefix, 'optimize-popover-lead')}>
        Start with a plain question; open Advanced only when you need formulas and spatial snippets.
      </p>

      <div className={pfx(cssPrefix, 'optimize-examples')}>
        <div className={pfx(cssPrefix, 'optimize-examples-label')}>Try asking · جرّب أن تقول</div>
        <div className={pfx(cssPrefix, 'optimize-chip-row')}>
          {optimizePack.examples.map(ex => (
            <button key={ex} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(ex, 'append')}>
              {ex.length > 72 ? `${ex.slice(0, 70)}…` : ex}
            </button>
          ))}
        </div>
      </div>

      <div className={pfx(cssPrefix, 'optimize-refined')}>
        <span className={pfx(cssPrefix, 'optimize-refined-label')}>Sharpen wording · صقل الصياغة</span>
        <p className={pfx(cssPrefix, 'optimize-refined-text')}>{optimizePack.refined}</p>
        <div className={pfx(cssPrefix, 'optimize-refined-actions')}>
          <button type="button" className={pfx(cssPrefix, 'optimize-chip-primary')} onClick={() => insertFromOptimize(optimizePack.refined, 'replace')}>
            Use wording
          </button>
          <button type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(optimizePack.refined, 'append')}>
            Append
          </button>
        </div>
      </div>

      <details className={pfx(cssPrefix, 'optimize-advanced')}>
        <summary className={pfx(cssPrefix, 'optimize-advanced-summary')}>Advanced · عمليات تقنية</summary>

        <div className={pfx(cssPrefix, 'optimize-section')}>
          <div className={pfx(cssPrefix, 'optimize-section-title')}>
            Stats <span className={pfx(cssPrefix, 'optimize-section-sub')}>(إحصائياً)</span>
          </div>
          <div className={pfx(cssPrefix, 'optimize-chip-row')}>
            {optimizePack.stats.map(s => (
              <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
                {s.length > 52 ? `${s.slice(0, 50)}…` : s}
              </button>
            ))}
          </div>
        </div>

        <div className={pfx(cssPrefix, 'optimize-section')}>
          <div className={pfx(cssPrefix, 'optimize-section-title')}>
            Filters <span className={pfx(cssPrefix, 'optimize-section-sub')}>(رياضياً)</span>
          </div>
          <div className={pfx(cssPrefix, 'optimize-chip-row')}>
            {optimizePack.math.map(s => (
              <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className={pfx(cssPrefix, 'optimize-section')}>
          <div className={pfx(cssPrefix, 'optimize-section-title')}>
            Spatial <span className={pfx(cssPrefix, 'optimize-section-sub')}>(مكانياً)</span>
          </div>
          <div className={pfx(cssPrefix, 'optimize-chip-row')}>
            {optimizePack.spatial.map(s => (
              <button key={s} type="button" className={pfx(cssPrefix, 'optimize-chip')} onClick={() => insertFromOptimize(s, 'append')}>
                {s.length > 56 ? `${s.slice(0, 54)}…` : s}
              </button>
            ))}
          </div>
        </div>
      </details>

      <p className={pfx(cssPrefix, 'optimize-context')}>
        Layers: {availableLayers.length ? availableLayers.slice(0, 4).join(', ') : '—'}
        {availableLayers.length > 4 ? '…' : ''} · Fields: {availableFields.length} · Numeric: {availableNumericFields.length}
      </p>
    </div>
  ) : null

  return (
    <>
      {showOptimizeChrome ? (
        <div ref={optimizeWrapRef} className={pfx(cssPrefix, 'optimize-wrap')}>
          {optimizePopover}
          {showSuggestPanel ? (
            <div className={pfx(cssPrefix, 'smart-suggest-panel')} role="region" aria-label="Smart guide">
              <div className={pfx(cssPrefix, 'smart-suggest-toolbar')}>
                <span className={pfx(cssPrefix, 'smart-suggest-title')}>Smart guide</span>
                {renderOptimizeTrigger()}
                <span className={pfx(cssPrefix, 'smart-suggest-toolbar-spacer')} aria-hidden />
                <span className={pfx(cssPrefix, 'smart-suggest-meta')}>
                  {visibleChips.length}/{Math.min(rankedChips.length, MAX_VISIBLE)}
                  {visibleChips.length > 0 ? ' · Alt+1–9' : ''}
                </span>
              </div>
              <div className={pfx(cssPrefix, 'smart-suggest-scroll')} role="listbox" aria-label="Guide chips">
                {visibleChips.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    role="option"
                    ref={el => {
                      chipRefs.current[i] = el
                    }}
                    tabIndex={chipFocusIdx === i ? 0 : -1}
                    className={`${pfx(cssPrefix, 'smart-chip')} ${pfx(cssPrefix, `smart-chip--${c.tier}`)}`}
                    title={`${c.insert} — Alt+${i + 1}`}
                    onMouseDown={ev => ev.preventDefault()}
                    onClick={() => applySuggestion(c.insert)}
                    onKeyDown={e => onChipKeyDown(e, i)}
                  >
                    <span className={pfx(cssPrefix, 'smart-chip-label')}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={pfx(cssPrefix, 'optimize-strip')} role="region" aria-label="Question guide">
              <span className={pfx(cssPrefix, 'optimize-strip-label')}>Guide</span>
              {renderOptimizeTrigger()}
            </div>
          )}
        </div>
      ) : null}
      <div className={pfx(cssPrefix, 'composer-surface')} data-voice-state={enableVoice ? voiceUiState : undefined}>
        <header className={pfx(cssPrefix, 'composer-head')}>
          <span className={pfx(cssPrefix, 'composer-head-led')} aria-hidden />
          <div className={pfx(cssPrefix, 'composer-head-logo')} aria-hidden>
            <i className="fa-solid fa-comments" />
          </div>
          <div className={pfx(cssPrefix, 'composer-head-copy')}>
            <span className={pfx(cssPrefix, 'composer-head-title')}>Geo AI</span>
            <span className={pfx(cssPrefix, 'composer-head-meta')}>
              <kbd className={pfx(cssPrefix, 'composer-kbd')}>↵</kbd> send ·{' '}
              <kbd className={pfx(cssPrefix, 'composer-kbd')}>⇧↵</kbd> line
            </span>
          </div>
        </header>

        <div className={pfx(cssPrefix, 'composer-field')}>
          <textarea
            ref={textareaRef}
            className={pfx(cssPrefix, 'input')}
            rows={1}
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => {
              window.setTimeout(() => {
                const a = document.activeElement
                if (a && a.closest?.(`.${pfx(cssPrefix, 'smart-suggest-panel')}`)) return
                if (a && a.closest?.(`.${pfx(cssPrefix, 'optimize-wrap')}`)) return
                setComposerFocused(false)
              }, 0)
            }}
            onKeyDown={e => {
              onTextareaKeyDown(e)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder={placeholder}
            aria-label={textareaAriaLabel}
            disabled={busy}
          />
          {enableVoice && (voiceUiState === 'listening' || voiceUiState === 'capturing') ? (
            <div className={pfx(cssPrefix, 'composer-voice-hint')} aria-live="polite">
              {voiceUiState === 'capturing' && interimPreview ? (
                <>
                  <span className={pfx(cssPrefix, 'composer-voice-dot')} aria-hidden />
                  <span className={pfx(cssPrefix, 'composer-voice-hint-text')}>{interimPreview}</span>
                </>
              ) : (
                <>
                  <span className={pfx(cssPrefix, 'composer-voice-dot')} aria-hidden />
                  <span className={pfx(cssPrefix, 'composer-voice-hint-text')}>
                    {voiceUiState === 'capturing' ? 'Capturing…' : 'Listening…'}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className={pfx(cssPrefix, 'composer-rule')} aria-hidden />

        <footer className={pfx(cssPrefix, 'composer-toolbar')} aria-label="Composer actions">
          {enableVoice ? (
            <>
              <button
                type="button"
                className={`${pfx(cssPrefix, 'composer-icon-btn')} ${voice.listening ? `${pfx(cssPrefix, 'composer-icon-btn--active')}` : ''} ${
                  voiceUiState === 'capturing' ? `${pfx(cssPrefix, 'composer-icon-btn--live')}` : ''
                } ${!voice.supported ? `${pfx(cssPrefix, 'composer-icon-btn--muted')}` : ''}`}
                onClick={onMicClick}
                disabled={busy}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
                title={
                  voice.supported
                    ? `${voice.listening ? 'Stop' : 'Start'} voice (${speechLangArabic ? 'Arabic' : 'English'})`
                    : 'Voice not supported in this browser'
                }
              >
                <i className="fa-solid fa-microphone" aria-hidden />
              </button>
              <button
                type="button"
                className={`${pfx(cssPrefix, 'composer-icon-btn')} ${pfx(cssPrefix, 'composer-icon-btn--lang')}`}
                onClick={() => {
                  voice.cycleLang()
                  voice.clearError()
                }}
                disabled={busy}
                aria-label={`Speech language: ${speechLangArabic ? 'Arabic' : 'English'}. Switch.`}
                title={`${speechLangArabic ? 'Arabic' : 'English'} — click to toggle`}
              >
                <i className="fa-solid fa-language" aria-hidden />
                <span className={pfx(cssPrefix, 'composer-lang-badge')}>{speechLangArabic ? 'AR' : 'EN'}</span>
              </button>
            </>
          ) : null}
          <span className={pfx(cssPrefix, 'composer-toolbar-spacer')} />
          {showAttach && fileInputRef && onAttachChange ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className={pfx(cssPrefix, 'file-input')}
                accept="image/*"
                onChange={onAttachChange}
                aria-hidden
                tabIndex={-1}
              />
              <button
                type="button"
                className={pfx(cssPrefix, 'composer-icon-btn')}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Attach image"
                title="Attach image"
              >
                <i className="fa-solid fa-paperclip" aria-hidden />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`${pfx(cssPrefix, 'composer-icon-btn')} ${pfx(cssPrefix, 'composer-icon-btn--send')}`}
            onClick={() => onSend()}
            disabled={busy || (!draft.trim() && !(showAttach && pendingImage))}
            aria-label="Send message"
            title="Send"
          >
            <i className="fa-solid fa-paper-plane" aria-hidden />
          </button>
        </footer>

        {voice.error ? <p className={pfx(cssPrefix, 'voice-error')}>{voice.error}</p> : null}
      </div>
    </>
  )
}
