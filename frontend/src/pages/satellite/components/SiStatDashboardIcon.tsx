import './SiStatDashboardIcon.css';

export type SiStatDashboardIconProps = {
  /** Icon box size in px (width & height). */
  size?: number;
  className?: string;
  title?: string;
};

/** GIS statistical dashboard glyph — KPI row + bar chart + trend line. */
export function SiStatDashboardIcon({ size = 14, className = '', title }: SiStatDashboardIconProps) {
  return (
    <svg
      className={['si-stat-dashboard-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect className="si-stat-dashboard-icon__frame" x="1.25" y="1.25" width="13.5" height="13.5" rx="2.2" />
      <rect className="si-stat-dashboard-icon__kpi" x="2.6" y="2.85" width="2.65" height="1.55" rx="0.35" />
      <rect className="si-stat-dashboard-icon__kpi" x="6.68" y="2.85" width="2.65" height="1.55" rx="0.35" />
      <rect className="si-stat-dashboard-icon__kpi" x="10.75" y="2.85" width="2.65" height="1.55" rx="0.35" />
      <line className="si-stat-dashboard-icon__rule" x1="2.4" y1="5.65" x2="13.6" y2="5.65" />
      <rect className="si-stat-dashboard-icon__bar" x="2.55" y="10.15" width="1.55" height="3.35" rx="0.32" />
      <rect className="si-stat-dashboard-icon__bar" x="4.75" y="8.75" width="1.55" height="4.75" rx="0.32" />
      <rect className="si-stat-dashboard-icon__bar" x="6.95" y="9.55" width="1.55" height="3.95" rx="0.32" />
      <rect className="si-stat-dashboard-icon__bar si-stat-dashboard-icon__bar--accent" x="9.15" y="7.65" width="1.55" height="5.85" rx="0.32" />
      <path
        className="si-stat-dashboard-icon__spark"
        d="M11.35 12.05 12.15 10.55 12.85 11.05 13.55 9.75 14.35 10.35"
      />
    </svg>
  );
}
