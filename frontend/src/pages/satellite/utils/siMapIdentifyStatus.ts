export type SiMapIdentifyStatusCard = {
  title: string;
  rows: { label: string; value: string }[];
  lng: number;
  lat: number;
  areaName?: string;
};

/** One-line map status bar summary for identify (no floating popup). */
export function formatMapIdentifyStatusMessage(card: SiMapIdentifyStatusCard): string {
  const place = card.areaName?.trim() ? ` · ${card.areaName.trim()}` : '';
  const head = `${card.title.trim() || 'Feature'}${place} @ ${card.lng.toFixed(5)}°, ${card.lat.toFixed(5)}°`;
  const detail = card.rows
    .slice(0, 3)
    .map(r => `${r.label}: ${r.value}`)
    .join(' · ');
  return detail ? `${head} — ${detail}` : head;
}
