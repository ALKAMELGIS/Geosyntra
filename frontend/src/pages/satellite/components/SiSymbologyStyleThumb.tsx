import type { CSSProperties } from 'react';
import { SI_SYM_AGOL_THUMB_BG, SI_SYM_AGOL_THUMB_FLAT_BG } from './siSymbologyAgolThumbAssets';

export type SiSymbologyStyleThumbProps = {
  thumb: string;
  className?: string;
};

/** ArcGIS Online–style map preview thumbnails for symbology style cards. */
export function SiSymbologyStyleThumb({ thumb, className = '' }: SiSymbologyStyleThumbProps) {
  const flatBg = SI_SYM_AGOL_THUMB_FLAT_BG[thumb];
  const svgBg = SI_SYM_AGOL_THUMB_BG[thumb];

  const style: CSSProperties | undefined =
    flatBg != null
      ? { backgroundColor: flatBg, backgroundImage: 'none' }
      : svgBg
        ? { backgroundImage: svgBg, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
        : undefined;

  return (
    <div
      className={`si-sym-agol-thumb si-sym-agol-thumb--${thumb}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden
    />
  );
}

/** Inline ramp strip for style-options panel. */
export function SiSymbologyRampStrip({
  rampCss,
  className = '',
}: {
  rampCss: string;
  className?: string;
}) {
  return (
    <span
      className={`si-sym-agol-ramp-strip${className ? ` ${className}` : ''}`}
      style={{ backgroundImage: rampCss } as CSSProperties}
      aria-hidden
    />
  );
}
