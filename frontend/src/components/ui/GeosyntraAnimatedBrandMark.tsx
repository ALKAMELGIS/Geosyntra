import { useMemo, type ReactNode } from 'react';
import { brandLogoSvgWithGradientId } from '../../lib/brand';
import { cn } from '../../lib/utils';
import { GeoTechOrbitScene } from './GeoTechOrbitScene';
import './geosyntra-animated-brand.css';

export type GeosyntraAnimatedBrandMarkProps = {
  size?: number;
  satellites?: number;
  live?: boolean;
  /** Slightly slower orbit + mesh for map loading screen. */
  relaxedMotion?: boolean;
  className?: string;
  sceneClassName?: string;
  markClassName?: string;
  gradientId?: string;
  /** Override center mark (e.g. motion wrapper on welcome wizard). */
  children?: ReactNode;
};

/**
 * Full Geosyntra animated brand — tech orbit field + wireframe mesh + hex G/L mark.
 * Same scene as the home wizard welcome logo (`gs-globe-orbit-field--rs`).
 */
export function GeosyntraAnimatedBrandMark({
  size = 220,
  satellites = 5,
  live = true,
  relaxedMotion = false,
  className,
  sceneClassName,
  markClassName,
  gradientId = 'gs-animated-brand-line',
  children,
}: GeosyntraAnimatedBrandMarkProps) {
  const svg = useMemo(() => brandLogoSvgWithGradientId(gradientId), [gradientId]);

  return (
    <div
      className={cn('gs-animated-brand', relaxedMotion && 'gs-animated-brand--relaxed', className)}
      aria-hidden
    >
      <GeoTechOrbitScene
        size={size}
        satellites={satellites}
        live={live}
        orbitPace={relaxedMotion ? 1.52 : 1}
        className={cn('gs-animated-brand__scene', sceneClassName)}
      >
        {children ?? (
          <div
            className={cn('gs-animated-brand__mark', markClassName)}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </GeoTechOrbitScene>
    </div>
  );
}
