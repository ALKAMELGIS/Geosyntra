import './siCalciteVerticalToolbar.css';

export type SiCalciteVerticalToolbarScale = 'm' | 's';
export type SiCalciteOverlayPositioning = 'absolute' | 'fixed';

export type SiCalciteVerticalToolbarProps = {
  /** Root toolbar accessible name */
  ariaLabel: string;
  /** Mirrors Calcite `scale` */
  scale?: SiCalciteVerticalToolbarScale;
  /** Mirrors Calcite `overlay-positioning` on the end action strip */
  overlayPositioning?: SiCalciteOverlayPositioning;
  /** When true, action rows show text labels (Calcite `text-enabled` style). */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Optional label for the default expand/collapse control */
  expandCollapseLabels?: { expand: string; collapse: string };
  /** Main tools (maps to default / main slot) */
  children?: React.ReactNode;
  /** Extra actions in the bottom group before expand (slot name `actions-end`) */
  actionsEnd?: React.ReactNode;
  /** Optional tooltip / hint region (slot name `expand-tooltip`) */
  expandTooltip?: React.ReactNode;
  className?: string;
  /** If false, no default expand button is rendered even when `onExpandedChange` is set */
  showDefaultExpandToggle?: boolean;
};

/**
 * Vertical toolbar mirroring Calcite action-bar semantics (no @esri/calcite-components bundle).
 * - Single `role="toolbar"` on root with `aria-orientation="vertical"`.
 * - Slots expressed as `data-slot` for documentation and styling hooks.
 */
/** Group wrapper for dynamic GIS / dashboard tools (mirrors `calcite-action-group`). */
export function SiCalciteToolbarActionGroup({
  children,
  part,
  className = '',
}: {
  children: React.ReactNode;
  /** Optional stable id for analytics / tests */
  part?: string;
  className?: string;
}) {
  return (
    <div
      className={['si-calcite-toolbar__action-group', className].filter(Boolean).join(' ')}
      data-part={part}
      role="group"
    >
      {children}
    </div>
  );
}

export function SiCalciteVerticalToolbar({
  ariaLabel,
  scale = 'm',
  overlayPositioning = 'absolute',
  expanded = false,
  onExpandedChange,
  expandCollapseLabels = { expand: 'Expand toolbar', collapse: 'Collapse toolbar' },
  children,
  actionsEnd,
  expandTooltip,
  className = '',
  showDefaultExpandToggle = true,
}: SiCalciteVerticalToolbarProps) {
  const rootClass = ['si-calcite-toolbar', className].filter(Boolean).join(' ');

  const defaultExpand =
    showDefaultExpandToggle && onExpandedChange ? (
      <button
        type="button"
        className="si-calcite-toolbar__expand"
        onClick={() => onExpandedChange(!expanded)}
        title={expanded ? expandCollapseLabels.collapse : expandCollapseLabels.expand}
        aria-label={expanded ? expandCollapseLabels.collapse : expandCollapseLabels.expand}
        aria-expanded={expanded}
      >
        <i className={expanded ? 'fa-solid fa-angles-left' : 'fa-solid fa-angles-right'} aria-hidden />
      </button>
    ) : null;

  return (
    <div
      className={rootClass}
      data-scale={scale}
      data-overlay-positioning={overlayPositioning}
      data-expanded={expanded ? 'true' : 'false'}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={ariaLabel}
    >
      <div className="si-calcite-toolbar__shell">
        <div className="si-calcite-toolbar__scroll">
          <div className="si-calcite-toolbar__slot" data-slot="default">
            {children}
          </div>
        </div>
        <div className="si-calcite-toolbar__end" data-slot="actions-end" role="presentation">
          <div className="si-calcite-toolbar__action-group" data-part="toolbar-actions-end">
            {actionsEnd}
            {defaultExpand}
          </div>
        </div>
      </div>
      {expandTooltip ? (
        <div className="si-calcite-toolbar__slot si-calcite-toolbar__slot--expand-tooltip" data-slot="expand-tooltip">
          {expandTooltip}
        </div>
      ) : null}
    </div>
  );
}
