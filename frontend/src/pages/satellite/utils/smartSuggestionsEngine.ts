/** Context-aware smart suggestions — no UI; consumed by SmartSuggestionsPanel. */

export type SmartSuggestionCategory = 'actions' | 'insights' | 'tools' | 'composer';

export type SmartSuggestionItem = {
  id: string;
  category: SmartSuggestionCategory;
  icon: string;
  title: string;
  description?: string;
  badge?: string;
  /** Insert into chat draft */
  insertText?: string;
  /** Map / app action (handled by parent) */
  actionId?: string;
  score: number;
  tier?: string;
};

export type SmartSuggestionsContext = {
  draft?: string;
  composerFocused?: boolean;
  availableLayers?: string[];
  availableFields?: string[];
  availableNumericFields?: string[];
  availableGeometryOps?: string[];
  satelliteProviderName?: string;
  activeLayerLabel?: string;
  activeLayerId?: string;
  hasAoi?: boolean;
  timelineActive?: boolean;
  selectedIndex?: string;
  autoScientific?: boolean;
};

const RECENT_LS_KEY = 'geo_ai_suggestions_recent_v1';

export function readRecentSuggestionScores(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECENT_LS_KEY) : null;
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function bumpRecentSuggestion(insert: string): void {
  try {
    const rec = readRecentSuggestionScores();
    rec[insert] = (rec[insert] ?? 0) + 1;
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECENT_LS_KEY, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function relevanceBonus(q: string, label: string): number {
  if (!q) return 0;
  const L = label.toLowerCase();
  const Q = q.toLowerCase();
  if (L.startsWith(Q)) return 22;
  if (L.includes(Q)) return 12;
  let bonus = 0;
  for (const tok of Q.split(/\s+/).filter(t => t.length > 1)) {
    if (L.includes(tok)) bonus += 6;
  }
  return bonus;
}

type RankedChip = {
  key: string;
  label: string;
  insert: string;
  tier: string;
  score: number;
};

function buildComposerChips(ctx: SmartSuggestionsContext): SmartSuggestionItem[] {
  const qRaw = (ctx.draft ?? '').trim();
  const q = qRaw.toLowerCase();
  const recentMap = readRecentSuggestionScores();
  const availableLayers = ctx.availableLayers ?? [];
  const availableFields = ctx.availableFields ?? [];
  const availableNumericFields = ctx.availableNumericFields ?? [];
  const availableGeometryOps = ctx.availableGeometryOps ?? ['Within', 'Intersects', 'Buffer', 'Contains'];
  const composerFocused = ctx.composerFocused ?? false;

  const dedupe = new Map<string, RankedChip>();
  const push = (c: RankedChip) => {
    const k = normalizeKey(c.key);
    const prev = dedupe.get(k);
    if (!prev || c.score > prev.score) dedupe.set(k, { ...c, key: k });
  };

  const recentBoost = (insert: string, base: number, tier: string) => {
    const uses = recentMap[insert] ?? 0;
    const rb = uses > 0 ? Math.min(18, 5 + Math.log10(uses + 1) * 8) : 0;
    return base + rb + relevanceBonus(qRaw, insert);
  };

  const calcIntent =
    /احسب|calculate|sum|average|mean|count|min|max|statistics|stat\b|group\s*by/i.test(qRaw);
  const filterIntent = /where|filter|>|<|=|within|intersects|contains|buffer/i.test(qRaw);
  const focusedOrTyping = composerFocused || qRaw.length > 0;
  if (!focusedOrTyping && !qRaw) return [];

  for (const [insert, uses] of Object.entries(recentMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)) {
    push({
      key: insert,
      label: insert.length > 28 ? `${insert.slice(0, 26)}…` : insert,
      insert,
      tier: 'recent',
      score: recentBoost(insert, 80, 'recent'),
    });
  }

  if (availableLayers.length && qRaw.length >= 2) {
    for (const l of availableLayers.filter(l => l.toLowerCase().includes(q)).slice(0, 4)) {
      const insert = l.includes(' ') ? `Layer: "${l}"` : `Layer: ${l}`;
      push({ key: insert, label: `Layer · ${l}`, insert, tier: 'context', score: recentBoost(insert, 72, 'context') });
    }
  }

  if (calcIntent || (composerFocused && !qRaw)) {
    for (const op of ['Sum', 'Average', 'Count', 'Min', 'Max', 'Group By']) {
      push({ key: op, label: op, insert: op, tier: 'op', score: recentBoost(op, 50, 'op') });
    }
  }

  if (filterIntent) {
    for (const op of ['>', '<', '>=', '<=', '=']) {
      push({ key: op, label: op, insert: op, tier: 'op', score: recentBoost(op, 48, 'op') });
    }
    for (const g of availableGeometryOps.slice(0, 4)) {
      push({ key: g, label: g, insert: g, tier: 'spatial', score: recentBoost(g, 46, 'spatial') });
    }
  }

  return [...dedupe.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(c => ({
      id: `composer-${c.key}`,
      category: 'composer' as const,
      icon: 'fa-solid fa-terminal',
      title: c.label,
      description: 'Insert into message',
      insertText: c.insert,
      score: c.score,
      tier: c.tier,
    }));
}

function buildSuggestedActions(ctx: SmartSuggestionsContext): SmartSuggestionItem[] {
  const placeHint = ctx.hasAoi ? 'this place on the map' : 'this place';
  const items: SmartSuggestionItem[] = [
    {
      id: 'action-route',
      category: 'actions',
      icon: 'fa-solid fa-route',
      title: 'Show me the route to this place',
      description: 'Directions to the selected map location',
      insertText: `Show me the route to ${placeHint}.`,
      score: 90,
      badge: ctx.hasAoi ? 'Map pin' : undefined,
    },
    {
      id: 'action-weather',
      category: 'actions',
      icon: 'fa-solid fa-cloud-sun',
      title: 'What is the weather at this place?',
      description: 'Current conditions near the selected location',
      insertText: `What is the weather at ${placeHint}?`,
      score: 85,
    },
    {
      id: 'action-hotels',
      category: 'actions',
      icon: 'fa-solid fa-hotel',
      title: 'Find hotels near this place',
      description: 'Lodging options around the selected location',
      insertText: `Find hotels near ${placeHint}.`,
      score: 82,
    },
    {
      id: 'action-report',
      category: 'actions',
      icon: 'fa-solid fa-file-pdf',
      title: 'Export Report',
      description: 'Open AOI vegetation report builder',
      actionId: 'export-report',
      score: ctx.hasAoi ? 88 : 40,
      badge: ctx.hasAoi ? 'AOI ready' : 'Draw AOI',
    },
  ];
  return items.filter(i => i.score >= 40);
}

function buildAiInsights(ctx: SmartSuggestionsContext): SmartSuggestionItem[] {
  const layer = (ctx.activeLayerLabel || ctx.activeLayerId || '').toUpperCase();
  const items: SmartSuggestionItem[] = [];

  if (/NDVI|SAVI|EVI|GNDVI|VEG/i.test(layer) || ctx.selectedIndex === 'SAVI') {
    items.push({
      id: 'insight-stress',
      category: 'insights',
      icon: 'fa-solid fa-triangle-exclamation',
      title: 'Possible vegetation stress',
      description: 'Low-index pockets may indicate moisture or health stress',
      insertText: 'Summarize possible vegetation stress patterns in the current AOI and timeline.',
      score: 78,
      badge: 'Vegetation',
    });
  }
  if (/NDWI|WATER|MOIST|NDMI/i.test(layer) || ctx.selectedIndex === 'NDWI') {
    items.push({
      id: 'insight-water',
      category: 'insights',
      icon: 'fa-solid fa-droplet',
      title: 'Water reduction detected',
      description: 'Compare wetness signal across recent weeks',
      insertText: 'Assess water / moisture reduction trends in the AOI across the timeline.',
      score: 76,
      badge: 'Water',
    });
  }
  items.push({
    id: 'insight-urban',
    category: 'insights',
    icon: 'fa-solid fa-city',
    title: 'Urban expansion observed',
    description: 'Built-up index shift when NDBI / RGB layers are active',
    insertText: 'Describe urban or built-up expansion signals visible in the current imagery context.',
    score: /NDBI|URBAN|RGB|TRUE/i.test(layer) ? 74 : 52,
    badge: 'Land cover',
  });

  if (ctx.timelineActive) {
    items.push({
      id: 'insight-temporal',
      category: 'insights',
      icon: 'fa-solid fa-clock-rotate-left',
      title: 'Temporal anomaly',
      description: 'Week-over-week deviation vs series mean',
      insertText: 'Flag temporal anomalies in the weekly composite series for this AOI.',
      score: 70,
    });
  }

  return items.sort((a, b) => b.score - a.score);
}

function buildQuickTools(ctx: SmartSuggestionsContext): SmartSuggestionItem[] {
  return [
    {
      id: 'tool-timeline',
      category: 'tools',
      icon: 'fa-solid fa-film',
      title: 'Open Timeline',
      description: 'Focus time-series controls and weekly chips',
      actionId: 'open-timeline',
      score: ctx.timelineActive ? 72 : 80,
    },
    {
      id: 'tool-scientific',
      category: 'tools',
      icon: 'fa-solid fa-flask',
      title: 'Enable Scientific Classification',
      description: '10-class spectral ramp aligned with symbology',
      actionId: 'toggle-scientific',
      score: ctx.autoScientific ? 55 : 84,
      badge: ctx.autoScientific ? 'On' : undefined,
    },
    {
      id: 'tool-export-png',
      category: 'tools',
      icon: 'fa-solid fa-camera',
      title: 'Export PNG',
      description: 'Capture current map canvas snapshot',
      actionId: 'export-png',
      score: ctx.hasAoi ? 82 : 48,
    },
    {
      id: 'tool-aoi-snapshot',
      category: 'tools',
      icon: 'fa-solid fa-vector-square',
      title: 'Create AOI Snapshot',
      description: 'Report-quality map frame with AOI outline',
      actionId: 'aoi-snapshot',
      score: ctx.hasAoi ? 86 : 42,
      badge: ctx.hasAoi ? undefined : 'Needs AOI',
    },
  ].sort((a, b) => b.score - a.score);
}

export function buildSmartSuggestions(ctx: SmartSuggestionsContext): SmartSuggestionItem[] {
  return [
    ...buildSuggestedActions(ctx),
    ...buildAiInsights(ctx),
    ...buildQuickTools(ctx),
    ...buildComposerChips(ctx),
  ].sort((a, b) => b.score - a.score);
}

export function filterSmartSuggestions(
  items: SmartSuggestionItem[],
  query: string,
  tab: SmartSuggestionCategory | 'all',
): SmartSuggestionItem[] {
  const q = query.trim().toLowerCase();
  let list = tab === 'all' ? items : items.filter(i => i.category === tab);
  if (!q) return list;
  return list.filter(
    i =>
      i.title.toLowerCase().includes(q) ||
      (i.description?.toLowerCase().includes(q) ?? false) ||
      (i.badge?.toLowerCase().includes(q) ?? false),
  );
}
