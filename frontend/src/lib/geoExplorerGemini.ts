/**
 * Geo Explorer–style Gemini helpers (see Free-AI-Things/Geo-Explorer).
 * API key must come from VITE_GEMINI_API_KEY — never commit real keys.
 */

export const GEO_EXPLORER_SYSTEM_PROMPT = `You are "Geo Explorer", a concise geography and Earth-observation assistant inside a Satellite Intelligence 3D globe map.
Help with places, directions, what satellite imagery might show, and short practical suggestions.
When the user should see ONE clear point on the map, end your reply with a new line exactly (WGS84 decimal degrees, longitude first then latitude, same order as GeoJSON coordinates):
MAP_QUERY:<longitude>,<latitude>
Example for central Dubai: MAP_QUERY:55.2708,25.2048
If there is no single map location, omit MAP_QUERY entirely.
Do not put MAP_QUERY inside markdown code fences.`;

/** Appended when LAYER DATA blocks are present (Added layers + GIS Content). */
export const GEO_EXPLORER_LAYER_RULES = `LAYER DATA rules (when a "LAYER DATA" / layer list section appears in your system context):
- Prefer facts, locations, and statistics from those layers over general web/world knowledge when the user names a layer, road ID, plot, or field that appears there.
- When attribute samples show domain/subtype descriptions (or "Label (stored code: …)"), explain using those human-readable labels; do not reply with raw codes only unless the user asks for codes.
- For feature or place questions tied to a layer: lead with a short **Interpretation**, then **Key attributes** as bullets; keep it concise like a GIS analyst note. Avoid pasting long JSON.
- MAP_QUERY must use coordinates that match a feature in LAYER DATA when the user asked for something tied to that dataset and you can identify a single feature (use its geometry centroid or point).
- If the user references a layer or attribute value that is not present in LAYER DATA, say so clearly and omit MAP_QUERY (do not guess a unrelated global location).
- For purely general geography questions with no layer tie, you may answer normally and use MAP_QUERY only when appropriate.`;

export type GeoExplorerPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; base64: string };

export type GeoExplorerMessage = {
  id: string;
  role: 'user' | 'model';
  parts: GeoExplorerPart[];
};

function isValidLngLat(lng: number, lat: number): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

/** Parse MAP_QUERY from model output; accepts lng,lat or corrects to lng,lat if only swapped pair is valid. */
export function parseMapQueryLngLat(text: string): [number, number] | null {
  const m = text.match(/MAP_QUERY:\s*([-\d.]+)\s*,\s*([-\d.]+)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (isValidLngLat(a, b)) return [a, b];
  if (isValidLngLat(b, a)) return [b, a];
  return null;
}

export function messageDisplayText(msg: GeoExplorerMessage): string {
  return msg.parts
    .filter((p): p is Extract<GeoExplorerPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('\n');
}

export function stripMapQueryLine(text: string): string {
  return text
    .replace(/\r?\nMAP_QUERY:\s*[^\n]+/gi, '')
    .replace(/^MAP_QUERY:\s*[^\n]+\r?\n?/i, '')
    .trimEnd();
}

function partsToGeminiPayload(parts: GeoExplorerPart[]): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
  return parts.map(p => {
    if (p.type === 'text') return { text: p.text };
    return { inline_data: { mime_type: p.mime, data: p.base64 } };
  });
}

export type GeminiContent = { role: 'user' | 'model'; parts: ReturnType<typeof partsToGeminiPayload> };

export function messagesToGeminiContents(messages: GeoExplorerMessage[]): GeminiContent[] {
  return messages.map(m => ({
    role: m.role,
    parts: partsToGeminiPayload(m.parts),
  }));
}

/**
 * Prefer 2.5 / 1.5 Flash — do not use gemini-2.0-flash here: many keys show free-tier quota limit 0 for that model.
 */
const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash-latest',
] as const;

function isNonRetryableGeminiAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('api key not valid') ||
    m.includes('invalid api key') ||
    m.includes('invalid argument') && m.includes('key')
  );
}

function shouldTryNextGeminiModel(status: number, message: string): boolean {
  const m = message.toLowerCase();
  return (
    status === 404 ||
    status === 400 ||
    status === 403 ||
    status === 429 ||
    status === 503 ||
    m.includes('quota') ||
    m.includes('exceeded') ||
    m.includes('billing') ||
    m.includes('limit: 0') ||
    m.includes('resource_exhausted') ||
    m.includes('resource exhausted') ||
    m.includes('rate limit') ||
    m.includes('rate_limit') ||
    m.includes('overloaded') ||
    m.includes('not found') ||
    m.includes('is not found') ||
    m.includes('not supported') ||
    m.includes('permission_denied') ||
    m.includes('permission denied')
  );
}

export async function geminiGenerateContent(params: {
  apiKey: string;
  systemInstruction: string;
  contents: GeminiContent[];
}): Promise<string> {
  const { apiKey, systemInstruction, contents } = params;
  let lastErr = 'Unknown error';

  for (const model of GEMINI_MODEL_CANDIDATES) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`;
      if (isNonRetryableGeminiAuthError(String(lastErr))) throw new Error(lastErr);
      if (shouldTryNextGeminiModel(res.status, String(lastErr))) continue;
      throw new Error(lastErr);
    }
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('') ?? '';
    if (!text) {
      lastErr = 'Empty model response';
      continue;
    }
    return text;
  }

  const hint =
    /quota|exceeded|rate|billing|limit:\s*0/i.test(lastErr)
      ? ' Enable billing in Google AI Studio / Cloud console, or wait and retry; free-tier limits vary by model.'
      : '';
  throw new Error(`${lastErr}${hint}`);
}
