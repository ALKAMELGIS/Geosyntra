/**
 * Geo Explorer–style Gemini helpers (see Free-AI-Things/Geo-Explorer).
 * API key must come from VITE_GEMINI_API_KEY — never commit real keys.
 */

export const GEO_EXPLORER_SYSTEM_PROMPT = `You are "Geo Explorer" / Geo AI: a concise assistant inside a map workspace (satellite globe or GIS map).

**Data-first:** When the system message includes vector layer summaries (active layers and/or GIS Content), any question about layer names, fields/attributes, feature IDs, counts, averages, or distributions MUST be answered **only** from that layer text. Be brief and professional: short **Interpretation** (1–3 sentences), then **Key attributes** or **Summary stats** as tight bullets (\`Field: value\`). Do not invent field values, counts, or coordinates that are not supported by the layer summaries.

**General geography:** If the question is clearly about world places, navigation, or imagery with **no** tie to the listed layers, you may use general knowledge — still stay concise.

**MAP_QUERY discipline:** Output MAP_QUERY **only** when a single WGS84 point is justified: either (a) explicitly requested by the user with reliable coordinates, or (b) a feature centroid from LAYER DATA that truly matches the question. If the user asks about a plot/ID/field that is **not** in the layer data, say clearly that it was **not found** in the current layers (Arabic or English to match the user) and **omit MAP_QUERY** — never substitute a random city or unrelated feature.

When the user should see ONE clear point on the map, end with a new line exactly:
MAP_QUERY:<longitude>,<latitude>
Example: MAP_QUERY:55.2708,25.2048
If there is no single justified location, omit MAP_QUERY entirely.
Do not put MAP_QUERY inside markdown code fences.`;

/** Appended when LAYER DATA blocks are present (Added layers + GIS Content). */
export const GEO_EXPLORER_LAYER_RULES = `LAYER DATA rules (when "LAYER DATA" / layer list / GIS Content sections appear):
- **Priority:** Facts, statistics, and locations must come from those layers (and GIS Content) before any general web knowledge whenever the user mentions layers, fields, features, parcels, or tabular values.
- **Concise analyst tone:** Short interpretation + bullets; for numeric summaries give one clear sentence (e.g. dominant class, approximate range) only if supported by the provided samples — no hallucinated precision.
- **Domains:** When samples show domain/subtype descriptions ("Label (stored code: …)"), use the human-readable label in answers.
- **Id catalogs & resolved rows:** Lines that include **"Layer id catalog"** list real codes/ids from **all** loaded features (e.g. Farm_Code values). A **"### RESOLVED LAYER FEATURE"** block is a full match for the current user message. If either contains the user’s id/code, treat it as present—**never** say "not found in summaries" only because the short "example attributes" line showed a different feature.
- **Not found:** If the requested ID or value is absent from catalogs, RESOLVED blocks, and fuzzy layer text, state that it is **not available in the loaded layers** (e.g. "غير موجود في الطبقات الحالية" / "Not found in current layers") and **omit MAP_QUERY**. Never move the map to a substitute location.
- **MAP_QUERY:** Only when a single feature match is evident from LAYER DATA or the user gave explicit coordinates. Never output MAP_QUERY for a "best guess" world city when the user asked about layer data that is missing.
- **General questions:** If there is no layer tie, answer from general knowledge; MAP_QUERY only when a single global place is clearly intended.`;

/** Shipped with Geo AI when a map pin / anchor exists — keeps follow-ups coherent and ties weather to coordinates. */
export const GEO_EXPLORER_SESSION_AND_WEATHER = `Session continuity & weather (read carefully when the next blocks appear):
- If a "### SESSION MAP ANCHOR" section is present, those coordinates are the app’s current map focus (pin or last explicit MAP_QUERY). Short follow-ups (“same place”, “here”, “that farm”, “weather there”, Arabic equivalents) refer to THIS anchor unless the user clearly names a different place or layer.
- If "### OPENWEATHER FACTS" is present (with "### WEATHER_ANSWER_RULES"), **all** numeric weather for that question must come only from that OpenWeather block for the stated “Point:” coordinates—follow WEATHER_ANSWER_RULES exactly. Cite “OpenWeather” once. Do not substitute current or forecast values for a **different** calendar day when the user asked for one specific day and the facts mark **NO_DATA_FOR_REQUESTED_DAY** or only errors.
- If "### OPEN-METEO FACTS" appears **without** OPENWEATHER (no API key case), base numeric weather on Open-Meteo only; cite “Open-Meteo” once. Do not invent numbers beyond the block.
- OPENWEATHER / OPEN-METEO blocks use the **same coordinates as SESSION MAP ANCHOR** when the anchor is present. Do **not** say the weather is for a different point than a layer feature (e.g. MH105) when the facts’ coordinates are that feature’s resolved location—the facts **are** that place for atmosphere data. Never steer the user to another city or coordinates they did not ask about.
- If the user asks for a **specific calendar day** and the facts do not contain usable data for that day (see NO_DATA_FOR_REQUESTED_DAY or failed requests), respond professionally that data could not be obtained: Arabic → **لم أتحصل على بيانات**; English → a short “I could not obtain data for that date/location.” Do **not** answer with “current” or unrelated dates as a stand-in.
- If OPEN-METEO or OpenWeather shows only fetch/API errors and no usable numbers, say so briefly—do not invent values.
- Keep answers concise: a short lead paragraph, then bullets if helpful; avoid dumping raw JSON from layer context.
- Conversations are sequential: short follow-ups (“coordinates of that place”, “same feature”, “what country”, “أعطني الإحداثيات”, “نفس الموقع”) refer to the last matched feature or SESSION MAP ANCHOR unless the user names a new layer or ID.`;

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

/** UI-only: remove appended map meta the server adds after model text (keep stored history intact for MAP_QUERY). */
export function stripGeoAiModelMetaAppend(text: string): string {
  let t = text.trimEnd()
  t = t.replace(/\n\n\(Map centered on the best place-name match for your message\.\)/gi, '')
  t = t.replace(/\n\n\(Map pin from layer[\s\S]*$/m, '')
  t = t.replace(/\n\n\*\*Map:\*\*[\s\S]*$/, '')
  return t.trimEnd()
}

/** Chat bubble display: MAP_QUERY line, server map-pin / geocode appendix, and literal `*` (markdown noise). */
export function stripGeoExplorerBubbleDisplayText(text: string): string {
  return stripGeoAiModelMetaAppend(stripMapQueryLine(text)).replace(/\*/g, '').trimEnd()
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

/** Newest model message first: returns [lng, lat] from the first MAP_QUERY line found. */
export function lastMapQueryCoordsFromMessages(messages: GeoExplorerMessage[]): [number, number] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'model') continue
    const c = parseMapQueryLngLat(messageDisplayText(m))
    if (c) return c
  }
  return null
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
