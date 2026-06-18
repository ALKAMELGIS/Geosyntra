/** Reverse geocode AOI centroid for popup place labels (Mapbox → Nominatim fallback). */
export async function reverseAoiPlace(
  lng: number,
  lat: number,
  mapboxToken?: string,
): Promise<{ region?: string; country?: string }> {
  const token = typeof mapboxToken === 'string' ? mapboxToken.trim() : '';
  if (token) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as {
          features?: Array<{
            text?: string;
            context?: Array<{ id?: string; text?: string }>;
          }>;
        };
        const f = j?.features?.[0];
        if (f) {
          const ctx = Array.isArray(f.context) ? f.context : [];
          const countryEnt = ctx.find(c => String(c?.id || '').startsWith('country'));
          const country = countryEnt?.text ? String(countryEnt.text).trim() : '';
          const placeFromCtx = ctx.find(c => /(place|locality|district|neighborhood)/.test(String(c?.id || '')));
          const region =
            (typeof f.text === 'string' && f.text.trim() ? f.text.trim() : '') ||
            (placeFromCtx?.text ? String(placeFromCtx.text).trim() : '') ||
            '';
          return { region: region || undefined, country: country || undefined };
        }
      }
    } catch {
      /* OSM fallback */
    }
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Geosyntra/1.0 (AOI popup)' } },
    );
    if (!res.ok) return {};
    const j = (await res.json()) as { name?: string; address?: Record<string, string> };
    const a = j?.address || {};
    const region =
      a.village ||
      a.town ||
      a.city ||
      a.county ||
      a.state ||
      a.hamlet ||
      (typeof j?.name === 'string' ? j.name : '') ||
      '';
    const country = a.country || '';
    return {
      region: typeof region === 'string' && region.trim() ? region.trim() : undefined,
      country: typeof country === 'string' && country.trim() ? country.trim() : undefined,
    };
  } catch {
    return {};
  }
}

export function formatAoiCentroid(lng: number, lat: number): string {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '—';
  return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
}
