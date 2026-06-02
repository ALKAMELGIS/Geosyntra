import './SiAgolTableActionRail.css';

export type SiAgolTableActionRailProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  canZoomSelection: boolean;
  onZoomSelection: () => void;
  onHome: () => void;
  canClearSelection: boolean;
  onClearSelection: () => void;
  showSelectedOnly: boolean;
  canShowSelected: boolean;
  onShowSelected: () => void;
  canShowAll: boolean;
  onShowAll: () => void;
  canRefresh: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  canHighlight?: boolean;
  onHighlight?: () => void;
};

type RailBtn = {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
};

export function SiAgolTableActionRail({
  expanded,
  onExpandedChange,
  canZoomSelection,
  onZoomSelection,
  onHome,
  canClearSelection,
  onClearSelection,
  showSelectedOnly,
  canShowSelected,
  onShowSelected,
  canShowAll,
  onShowAll,
  canRefresh,
  refreshing,
  onRefresh,
  canHighlight = false,
  onHighlight,
}: SiAgolTableActionRailProps) {
  const primary: RailBtn[] = [
    {
      id: 'zoom',
      label: 'Zoom to selection',
      icon: 'fa-arrows-to-dot',
      onClick: onZoomSelection,
      disabled: !canZoomSelection,
    },
    {
      id: 'home',
      label: 'Home',
      icon: 'fa-house',
      onClick: onHome,
    },
    {
      id: 'highlight',
      label: 'Highlight on map',
      icon: 'fa-highlighter',
      onClick: () => onHighlight?.(),
      disabled: !canHighlight || !onHighlight,
    },
  ];

  const secondary: RailBtn[] = [
    {
      id: 'clear',
      label: 'Clear selection',
      icon: 'fa-eraser',
      onClick: onClearSelection,
      disabled: !canClearSelection,
    },
    {
      id: 'selected',
      label: 'Show selected',
      icon: 'fa-filter',
      onClick: onShowSelected,
      disabled: !canShowSelected,
      active: showSelectedOnly,
    },
    {
      id: 'all',
      label: 'Show all',
      icon: 'fa-list',
      onClick: onShowAll,
      disabled: !canShowAll,
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: refreshing ? 'fa-rotate-right fa-spin' : 'fa-rotate-right',
      onClick: onRefresh,
      disabled: !canRefresh,
    },
  ];

  const renderBtn = (btn: RailBtn) => (
    <button
      key={btn.id}
      type="button"
      className={`si-agol-table-rail__btn${btn.active ? ' si-agol-table-rail__btn--active' : ''}`}
      title={btn.label}
      aria-label={btn.label}
      disabled={btn.disabled}
      onClick={btn.onClick}
    >
      <i className={`fa-solid ${btn.icon}`} aria-hidden />
      {expanded ? <span className="si-agol-table-rail__label">{btn.label}</span> : null}
    </button>
  );

  return (
    <nav className={`si-agol-table-rail${expanded ? ' si-agol-table-rail--expanded' : ''}`} aria-label="Table tools">
      <div className="si-agol-table-rail__tools">
        {primary.map(renderBtn)}
        <div className="si-agol-table-rail__sep" role="separator" />
        {secondary.map(renderBtn)}
      </div>
      <button
        type="button"
        className="si-agol-table-rail__collapse"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        title={expanded ? 'Collapse' : 'Expand tools'}
      >
        <i className={`fa-solid fa-angles-${expanded ? 'left' : 'right'}`} aria-hidden />
        {expanded ? <span>Collapse</span> : null}
      </button>
    </nav>
  );
}
