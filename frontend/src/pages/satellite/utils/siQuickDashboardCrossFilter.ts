export type SiQuickCrossFilter =
  | { type: 'equals'; field: string; value: string; sourceWidgetId?: string }
  | { type: 'range'; field: string; from: string; to: string; sourceWidgetId?: string }
  | null;

function readProp(feature: GeoJSON.Feature, field: string): unknown {
  return (feature.properties as Record<string, unknown> | undefined)?.[field];
}

function normValue(raw: unknown): string {
  if (raw == null || raw === '') return '';
  return String(raw).trim();
}

export function applyQuickDashboardCrossFilter(
  features: GeoJSON.Feature[],
  filter: SiQuickCrossFilter,
): GeoJSON.Feature[] {
  if (!filter) return features;
  if (filter.type === 'equals') {
    return features.filter(f => normValue(readProp(f, filter.field)) === filter.value);
  }
  return features.filter(f => {
    const v = normValue(readProp(f, filter.field));
    return v >= filter.from && v <= filter.to;
  });
}

export function toggleQuickDashboardCrossFilter(
  current: SiQuickCrossFilter,
  next: Exclude<SiQuickCrossFilter, null>,
): SiQuickCrossFilter {
  if (
    current?.type === next.type &&
    current.field === next.field &&
    next.type === 'equals' &&
    current.type === 'equals' &&
    current.value === next.value
  ) {
    return null;
  }
  if (
    current?.type === 'range' &&
    next.type === 'range' &&
    current.field === next.field &&
    current.from === next.from &&
    current.to === next.to
  ) {
    return null;
  }
  return next;
}

export function describeQuickDashboardCrossFilter(
  filter: SiQuickCrossFilter,
  fieldLabel?: string,
): string {
  if (!filter) return '';
  const label = fieldLabel ?? filter.field;
  if (filter.type === 'equals') return `${label} = ${filter.value}`;
  return `${label}: ${filter.from} → ${filter.to}`;
}
