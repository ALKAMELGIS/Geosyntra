import type { SiQuickFieldKind } from './siQuickDashboardEngine';

export type SiQuickDashboardThemeId = 'emerald' | 'ocean' | 'violet' | 'sunset' | 'spatial';

export type SiQuickDashboardTheme = {
  id: SiQuickDashboardThemeId;
  label: string;
  accent: string;
  accent2: string;
  barGradient: string;
  kpiGradient: string;
  glow: string;
  chartColors: string[];
  cssVars: Record<string, string>;
};

/** UI accent tokens — soft indigo base; chart colors stay vivid per theme. */
const UI_ACCENT = '#6366f1';
const UI_ACCENT_2 = '#818cf8';
const UI_PANEL_GLOW = 'rgba(99, 102, 241, 0.06)';

const THEMES: Record<SiQuickDashboardThemeId, SiQuickDashboardTheme> = {
  emerald: {
    id: 'emerald',
    label: 'Indigo',
    accent: UI_ACCENT,
    accent2: UI_ACCENT_2,
    barGradient: 'linear-gradient(90deg, #6366f1, #818cf8)',
    kpiGradient: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(129,140,248,0.05))',
    glow: 'rgba(99, 102, 241, 0.18)',
    chartColors: ['#6366f1', '#818cf8', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'],
    cssVars: {
      '--si-qdash-accent': UI_ACCENT,
      '--si-qdash-accent-2': UI_ACCENT_2,
      '--si-qdash-panel-glow': UI_PANEL_GLOW,
    },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    accent: '#0ea5e9',
    accent2: '#6366f1',
    barGradient: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
    kpiGradient: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(99,102,241,0.05))',
    glow: 'rgba(14, 165, 233, 0.18)',
    chartColors: ['#0ea5e9', '#6366f1', '#38bdf8', '#818cf8', '#7dd3fc', '#a5b4fc'],
    cssVars: {
      '--si-qdash-accent': '#0ea5e9',
      '--si-qdash-accent-2': '#6366f1',
      '--si-qdash-panel-glow': 'rgba(14, 165, 233, 0.06)',
    },
  },
  violet: {
    id: 'violet',
    label: 'Violet',
    accent: '#8b5cf6',
    accent2: '#ec4899',
    barGradient: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
    kpiGradient: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(236,72,153,0.05))',
    glow: 'rgba(139, 92, 246, 0.18)',
    chartColors: ['#8b5cf6', '#ec4899', '#a78bfa', '#f472b6', '#ddd6fe', '#fda4af'],
    cssVars: {
      '--si-qdash-accent': '#8b5cf6',
      '--si-qdash-accent-2': '#ec4899',
      '--si-qdash-panel-glow': 'rgba(139, 92, 246, 0.06)',
    },
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    accent: '#f59e0b',
    accent2: '#f97316',
    barGradient: 'linear-gradient(90deg, #f59e0b, #f97316)',
    kpiGradient: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(249,115,22,0.05))',
    glow: 'rgba(245, 158, 11, 0.18)',
    chartColors: ['#f59e0b', '#f97316', '#fbbf24', '#fb923c', '#fde68a', '#fdba74'],
    cssVars: {
      '--si-qdash-accent': '#f59e0b',
      '--si-qdash-accent-2': '#f97316',
      '--si-qdash-panel-glow': 'rgba(245, 158, 11, 0.06)',
    },
  },
  spatial: {
    id: 'spatial',
    label: 'Spatial',
    accent: '#14b8a6',
    accent2: '#6366f1',
    barGradient: 'linear-gradient(90deg, #14b8a6, #6366f1)',
    kpiGradient: 'linear-gradient(135deg, rgba(20,184,166,0.08), rgba(99,102,241,0.05))',
    glow: 'rgba(20, 184, 166, 0.18)',
    chartColors: ['#14b8a6', '#6366f1', '#2dd4bf', '#818cf8', '#99f6e4', '#a5b4fc'],
    cssVars: {
      '--si-qdash-accent': '#14b8a6',
      '--si-qdash-accent-2': '#6366f1',
      '--si-qdash-panel-glow': 'rgba(20, 184, 166, 0.06)',
    },
  },
};

export function getQuickDashboardTheme(id: SiQuickDashboardThemeId): SiQuickDashboardTheme {
  return THEMES[id];
}

export function pickQuickDashboardTheme(
  fields: Array<{ kind: SiQuickFieldKind }>,
  hasArea: boolean,
): SiQuickDashboardTheme {
  if (hasArea) return THEMES.spatial;
  const kinds = new Set(fields.map(f => f.kind));
  if (kinds.has('date')) return THEMES.ocean;
  if (kinds.has('category') && !kinds.has('number')) return THEMES.violet;
  if (kinds.has('number') && kinds.has('category')) return THEMES.emerald;
  if (kinds.has('number')) return THEMES.emerald;
  return THEMES.sunset;
}
