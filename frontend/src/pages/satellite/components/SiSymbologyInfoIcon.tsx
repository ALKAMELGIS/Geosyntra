export type SiSymbologyInfoIconProps = {
  className?: string;
  title?: string;
  size?: number;
};

/** Minimal info-circle glyph — reliable where Font Awesome regular may not load. */
export function SiSymbologyInfoIcon({ className = '', title, size = 14 }: SiSymbologyInfoIconProps) {
  return (
    <svg
      className={`si-sym-info-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
      <path d="M8 7.1v4.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}
