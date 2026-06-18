import type { NavigateFunction } from 'react-router-dom'
import { SAAS_ROUTES } from './saasRoutes'

export const HOME_START_SECTION_ID = 'start'

/** Scroll to the SaaS hero (`#start`) after navigation to home. */
export function stashHomeStartScroll(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem('geosyntra-scroll-to', HOME_START_SECTION_ID)
  } catch {
    /* ignore */
  }
}

/** Post-login landing: home page + Start section (not satellite dashboard). */
export function navigateToHomeStart(
  navigate: NavigateFunction,
  opts?: { replace?: boolean },
): void {
  stashHomeStartScroll()
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
  const replace = opts?.replace ?? true
  const path =
    typeof window !== 'undefined'
      ? (window.location.pathname || '').replace(/\/$/, '') || '/'
      : '/'
  const onHome = path === '/' || path === ''
  void navigate(SAAS_ROUTES.home, { replace })
  if (onHome) {
    window.requestAnimationFrame(() => {
      scrollToInPageSection(`#${HOME_START_SECTION_ID}`, 'auto')
    })
  }
}

/** In-page section id (e.g. pricing) — not a HashRouter route segment. */
export function isInPageFragmentHref(href: string): boolean {
  const h = href.trim();
  return h.startsWith('#') && !h.startsWith('#/');
}

/** HashRouter home route on GitHub Pages (`#/`), without breaking in-page anchors. */
export function restoreHashRouterShellHash(): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  if (!hash || hash === '#/' || hash.startsWith('#/')) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}#/`);
}

export function scrollToInPageSection(href: string, behavior: ScrollBehavior = 'smooth'): boolean {
  const id = href.replace(/^#/, '').split(/[?#]/)[0]?.trim();
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior, block: 'start' });
  return true;
}

/** If the user landed on `#pricing` (breaks HashRouter), normalize to `#/` and scroll. */
export function repairBrokenInPageHashOnLoad(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!isInPageFragmentHref(hash)) return null;
  const id = hash.slice(1).split(/[?#]/)[0]?.trim() || null;
  restoreHashRouterShellHash();
  return id;
}
