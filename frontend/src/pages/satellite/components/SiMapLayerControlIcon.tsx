import './SiMapLayerControlIcon.css';

export type SiMapLayerControlIconProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Layer stack glyph — basemap + operational layers (MapLibre Layer Control). */
export function SiMapLayerControlIcon({
  size = 16,
  className = '',
  title,
}: SiMapLayerControlIconProps) {
  return (
    <svg
      className={['si-map-layer-control-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect className="si-map-layer-control-icon__sheet si-map-layer-control-icon__sheet--back" x="1.5" y="4.2" width="10.5" height="8.2" rx="1.1" />
      <rect className="si-map-layer-control-icon__sheet si-map-layer-control-icon__sheet--mid" x="2.8" y="2.9" width="10.5" height="8.2" rx="1.1" />
      <rect className="si-map-layer-control-icon__sheet si-map-layer-control-icon__sheet--front" x="4.1" y="1.6" width="10.5" height="8.2" rx="1.1" />
      <path className="si-map-layer-control-icon__fold" d="M4.1 1.6h7.2L14.6 4.4v5.4a1.1 1.1 0 0 1-1.1 1.1H4.1" />
      <line className="si-map-layer-control-icon__rule" x1="5.4" y1="5.1" x2="12.8" y2="5.1" />
      <line className="si-map-layer-control-icon__rule" x1="5.4" y1="7.2" x2="11.4" y2="7.2" />
      <line className="si-map-layer-control-icon__rule si-map-layer-control-icon__rule--accent" x1="5.4" y1="9.3" x2="10.2" y2="9.3" />
    </svg>
  );
}
