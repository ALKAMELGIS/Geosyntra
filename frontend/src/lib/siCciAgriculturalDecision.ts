/** Composite Crop Index — agricultural decision tiers (Layer Live CCI). */

export type SiCciAgriculturalTier = 'excellent' | 'monitoring' | 'warning' | 'risk';

export type SiCciAgriculturalDecision = {
  tier: SiCciAgriculturalTier;
  emoji: string;
  statusAr: string;
  statusEn: string;
  decisionAr: string;
  decisionEn: string;
  rangeLabel: string;
  min: number;
  max: number;
};

export const SI_CCI_AGRICULTURAL_TIERS: readonly SiCciAgriculturalDecision[] = [
  {
    tier: 'excellent',
    emoji: '🟢',
    statusAr: 'جيد جدًا',
    statusEn: 'Excellent',
    decisionAr: 'لا يوجد تدخل، متابعة فقط',
    decisionEn: 'No intervention — monitoring only',
    rangeLabel: '0.60 – 1.00',
    min: 0.6,
    max: 1.0,
  },
  {
    tier: 'monitoring',
    emoji: '🟡',
    statusAr: 'مراقبة',
    statusEn: 'Monitoring',
    decisionAr: 'متابعة الري والتسميد',
    decisionEn: 'Follow irrigation and fertilization',
    rangeLabel: '0.20 – 0.60',
    min: 0.2,
    max: 0.6,
  },
  {
    tier: 'warning',
    emoji: '🟠',
    statusAr: 'تحذير',
    statusEn: 'Warning',
    decisionAr: 'فحص عاجل للري والتربة',
    decisionEn: 'Urgent irrigation and soil check',
    rangeLabel: '0.00 – 0.20',
    min: 0.0,
    max: 0.2,
  },
  {
    tier: 'risk',
    emoji: '🔴',
    statusAr: 'خطر',
    statusEn: 'Risk',
    decisionAr: 'تدخل فوري (ري / علاج / فحص شامل)',
    decisionEn: 'Immediate intervention (irrigation / treatment / full inspection)',
    rangeLabel: '< 0.00',
    min: -0.2,
    max: 0.0,
  },
] as const;

export function isCciLayerId(layerId: string): boolean {
  return String(layerId || '').trim().toUpperCase() === 'CCI';
}

export function classifyCciValue(cci: number): SiCciAgriculturalDecision | null {
  if (!Number.isFinite(cci)) return null;
  if (cci >= 0.6) return SI_CCI_AGRICULTURAL_TIERS[0]!;
  if (cci >= 0.2) return SI_CCI_AGRICULTURAL_TIERS[1]!;
  if (cci >= 0.0) return SI_CCI_AGRICULTURAL_TIERS[2]!;
  return SI_CCI_AGRICULTURAL_TIERS[3]!;
}

export function formatCciValue(cci: number): string {
  if (!Number.isFinite(cci)) return '—';
  return cci.toFixed(2);
}

/** Status + CCI value + agricultural decision (bilingual). */
export function formatCciDecisionDisplay(
  cci: number,
  locale: 'ar' | 'en' | 'both' = 'both',
): string {
  const d = classifyCciValue(cci);
  if (!d) return '—';
  const val = formatCciValue(cci);
  if (locale === 'ar') {
    return `${d.statusAr} ${d.emoji} · CCI ${val} · ${d.decisionAr}`;
  }
  if (locale === 'en') {
    return `${d.statusEn} ${d.emoji} · CCI ${val} · ${d.decisionEn}`;
  }
  return `${d.statusAr} ${d.emoji} · CCI ${val} · ${d.decisionAr} / ${d.decisionEn}`;
}
