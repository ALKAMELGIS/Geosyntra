export const SI_ELEV_PROFILE_DOCK_THEME_LS = 'si-elev-profile-dock-theme-v1';

export type SiElevProfileDockTheme = 'dark' | 'light';

export function readSiElevProfileDockTheme(): SiElevProfileDockTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = localStorage.getItem(SI_ELEV_PROFILE_DOCK_THEME_LS);
    return raw === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function persistSiElevProfileDockTheme(theme: SiElevProfileDockTheme): void {
  try {
    localStorage.setItem(SI_ELEV_PROFILE_DOCK_THEME_LS, theme);
  } catch {
    /* ignore */
  }
}

/** Per-session window placement (position + size) so the panel reopens where the user left it. */
export const SI_ELEV_PROFILE_DOCK_RECT_SS = 'si-elev-profile-dock-rect-v1';

export type SiElevProfileDockRect = { x: number; y: number; w: number; h: number };

export function readSiElevProfileDockRect(): SiElevProfileDockRect | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SI_ELEV_PROFILE_DOCK_RECT_SS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiElevProfileDockRect>;
    const { x, y, w, h } = parsed;
    if ([x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n))) {
      return { x: x as number, y: y as number, w: w as number, h: h as number };
    }
    return null;
  } catch {
    return null;
  }
}

export function persistSiElevProfileDockRect(rect: SiElevProfileDockRect): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SI_ELEV_PROFILE_DOCK_RECT_SS, JSON.stringify(rect));
  } catch {
    /* ignore */
  }
}
