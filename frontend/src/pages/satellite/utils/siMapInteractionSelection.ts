import type { SiDrawContextTarget } from './siDrawContextPick'

/** Whether the picked target is the one currently selected for Move. */
export function drawTargetMatchesSelection(
  target: SiDrawContextTarget,
  selection: SiDrawContextTarget | null,
): boolean {
  if (!selection) return false
  if (target.kind !== selection.kind) return false
  if (target.kind === 'drawn' && selection.kind === 'drawn') return true
  if (target.kind === 'field' && selection.kind === 'field') return target.fieldId === selection.fieldId
  if (target.kind === 'multiAoi' && selection.kind === 'multiAoi') return target.aoiId === selection.aoiId
  return false
}

export function selectionLabel(target: SiDrawContextTarget | null): string {
  if (!target) return ''
  return target.label
}
