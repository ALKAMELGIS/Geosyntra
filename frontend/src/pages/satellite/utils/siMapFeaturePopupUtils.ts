/** Attribute display helpers for map feature identify popups. */

const FEATURE_NAME_KEYS = [
  'Farm_Name',
  'FARM_NAME',
  'farm_name',
  'NAME',
  'Name',
  'name',
  'title',
  'Title',
  'Project_Code',
  'ProjectCode',
  'OBJECTID',
  'ObjectId',
  'objectid',
  'label',
  'Label',
] as const;

const URL_RX = /^https?:\/\/[^\s]+$/i;
const IMAGE_RX = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

export type SiMapFeaturePopupFieldKind = 'text' | 'number' | 'date' | 'url' | 'image' | 'email' | 'boolean' | 'pdf' | 'attachment';

const PDF_RX = /\.pdf(\?.*)?$/i;
const ATTACH_RX = /\.(docx?|xlsx?|pptx?|zip|rar|7z|csv|tif|tiff|geojson|kml|kmz)(\?.*)?$/i;

export function extractSiMapFeatureName(
  properties: Record<string, unknown> | null | undefined,
): string {
  if (!properties || typeof properties !== 'object') return '';
  for (const k of FEATURE_NAME_KEYS) {
    const raw = properties[k];
    if (raw == null || raw === '') continue;
    const s = String(raw).trim();
    if (s && !/^null$/i.test(s)) return s;
  }
  return '';
}

export function classifySiMapFeatureFieldKind(
  fieldName: string,
  rawValue: unknown,
): SiMapFeaturePopupFieldKind {
  const name = fieldName.toLowerCase();
  if (typeof rawValue === 'boolean') return 'boolean';
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return 'number';
  if (/date|time|created|modified|timestamp/.test(name)) return 'date';
  const text = String(rawValue ?? '').trim();
  if (!text) return 'text';
  if (URL_RX.test(text)) {
    if (IMAGE_RX.test(text) || /photo|image|thumb|picture/i.test(name)) return 'image';
    if (PDF_RX.test(text) || /pdf|document|report/i.test(name)) return 'pdf';
    if (ATTACH_RX.test(text) || /attach|file|download|media|asset/i.test(name)) return 'attachment';
    return 'url';
  }
  if (text.includes('@') && text.includes('.') && /email|mail/i.test(name)) return 'email';
  if (/^-?\d+(\.\d+)?$/.test(text) && /count|area|length|height|width|pop|qty|amount|value|id$/i.test(name)) {
    return 'number';
  }
  return 'text';
}

export function formatSiMapFeaturePopupValue(
  rawValue: unknown,
  kind: SiMapFeaturePopupFieldKind,
): string {
  if (rawValue == null || rawValue === '') return '—';
  if (kind === 'boolean') return rawValue ? 'Yes' : 'No';
  if (kind === 'number' && typeof rawValue === 'number') {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(rawValue);
  }
  if (kind === 'date') {
    const ms = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (Number.isFinite(ms) && ms > 1e11) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(d);
      }
    }
    const parsed = Date.parse(String(rawValue));
    if (Number.isFinite(parsed)) {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(parsed));
    }
  }
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(rawValue);
  }
  if (typeof rawValue === 'object') {
    try {
      return JSON.stringify(rawValue);
    } catch {
      return String(rawValue);
    }
  }
  return String(rawValue);
}

export function siMapFeaturePopupFieldIcon(kind: SiMapFeaturePopupFieldKind): string {
  switch (kind) {
    case 'number':
      return 'fa-hashtag';
    case 'date':
      return 'fa-calendar';
    case 'url':
      return 'fa-link';
    case 'image':
      return 'fa-image';
    case 'pdf':
      return 'fa-file-pdf';
    case 'attachment':
      return 'fa-paperclip';
    case 'email':
      return 'fa-envelope';
    case 'boolean':
      return 'fa-toggle-on';
    default:
      return 'fa-font';
  }
}

export function formatSiMapFeatureCoordinates(lng: number, lat: number, decimals = 5): string {
  const la = Math.abs(lat).toFixed(decimals) + (lat >= 0 ? '°N' : '°S');
  const lo = Math.abs(lng).toFixed(decimals) + (lng >= 0 ? '°E' : '°W');
  return `${la}, ${lo}`;
}

export function buildSiMapFeatureGeoJsonExport(
  feature: GeoJSON.Feature | null | undefined,
  layerName: string,
): string | null {
  if (!feature?.geometry) return null;
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          ...(typeof feature.properties === 'object' && feature.properties ? feature.properties : {}),
          _layerName: layerName,
        },
      },
    ],
  };
  return JSON.stringify(fc, null, 2);
}

export function resolveMapIdentifyPopupAccent(
  layer: { color?: string; fillColor?: string } | null | undefined,
): string {
  if (!layer) return '#22c55e';
  const c = layer.fillColor || layer.color;
  if (typeof c === 'string' && c.trim()) return c.trim();
  return '#22c55e';
}

export function downloadSiMapFeatureGeoJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/geo+json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type MapboxMapLike = {
  getLayer?: (id: string) => unknown;
  setPaintProperty?: (layer: string, prop: string, value: number) => void;
};

const SI_MAP_HIGHLIGHT_PULSE = [
  { id: 'si-geo-ai-sel-fill', prop: 'fill-opacity', low: 0.08, high: 0.42 },
  { id: 'si-geo-ai-sel-line', prop: 'line-opacity', low: 0.88, high: 1 },
  { id: 'si-geo-ai-sel-point', prop: 'circle-opacity', low: 0.82, high: 1 },
] as const;

/** Briefly pulse table-selection highlight layers on the map. */
export function pulseSiMapHighlightLayers(map: MapboxMapLike | null | undefined): void {
  if (!map?.getLayer || !map.setPaintProperty) return;
  const active = SI_MAP_HIGHLIGHT_PULSE.filter(s => map.getLayer!(s.id));
  if (!active.length) return;

  const start = performance.now();
  const durationMs = 1200;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const wave = Math.sin(t * Math.PI * 6) * (1 - t);
    for (const s of active) {
      const v = s.low + (s.high - s.low) * Math.max(0, wave);
      map.setPaintProperty!(s.id, s.prop, v);
    }
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      for (const s of active) {
        map.setPaintProperty!(s.id, s.prop, s.low);
      }
    }
  };
  requestAnimationFrame(tick);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
