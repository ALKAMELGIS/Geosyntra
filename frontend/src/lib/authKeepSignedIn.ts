const LS_KEEP_SIGNED_IN = 'geosyntra-keep-signed-in-v1'

/** User preference: persist session across browser restarts (localStorage vs sessionStorage). */
export function readKeepSignedInPreference(): boolean {
  try {
    return localStorage.getItem(LS_KEEP_SIGNED_IN) === '1'
  } catch {
    return false
  }
}

export function writeKeepSignedInPreference(keep: boolean): void {
  try {
    localStorage.setItem(LS_KEEP_SIGNED_IN, keep ? '1' : '0')
  } catch {
    /* ignore */
  }
}
