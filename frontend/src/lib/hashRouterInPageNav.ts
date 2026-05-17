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
