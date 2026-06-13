/** VITE_GEOSYNTRA_* preferred; VITE_AGRI_* legacy alias. */
export function vitePlatformEnv(shortName: string): string {
  const key = String(shortName || '').trim().toUpperCase()
  const geosyntra = import.meta.env[`VITE_GEOSYNTRA_${key}`]
  const legacy = import.meta.env[`VITE_AGRI_${key}`]
  return String(geosyntra || legacy || '').trim()
}
