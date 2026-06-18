/** True when arrow-key elevation shortcuts must not run (typing in a field, etc.). */
export function siMapElevationKeyboardTargetBlocked(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('[contenteditable="true"]'));
}

/**
 * Map Left/Right arrow to 2D/3D elevation view.
 * Returns `null` when the key should be ignored (modifiers, blocked target, no change).
 */
export function resolveSiMapElevationViewFromArrowKey(
  key: string,
  opts: {
    elevationActive: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    targetBlocked?: boolean;
  },
): boolean | null {
  if (opts.targetBlocked) return null;
  if (opts.altKey || opts.ctrlKey || opts.metaKey || opts.shiftKey) return null;
  if (key === 'ArrowRight') {
    if (opts.elevationActive) return null;
    return true;
  }
  if (key === 'ArrowLeft') {
    if (!opts.elevationActive) return null;
    return false;
  }
  return null;
}
